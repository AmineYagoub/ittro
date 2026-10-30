// Helper actors: pairing for a code, sending a question with its
// photo, polling while waiting, and the waiting pulse. The photo is
// resolved here, only after the shopper said yes: the last confirm
// crop when there is one, else a fresh camera shot.
import { fromCallback, fromPromise } from 'xstate';
import { askHelper, helperStatus, pairHelper as relayPair, pairStatus } from '../relay';
import { prepareShelfPhoto, takeCameraShot } from 'ittro-sensors';
import { playSound } from '../speech';
import { logIttro } from '../log';
import type { ConversationEvent } from '../conversation/types';

export interface PairHelperInput {
  name: string;
}

export interface PairHelperOutput {
  name: string;
  code: string;
  expiresAt: number;
}

export interface SendHelpInput {
  tokens: string[];
  question: string;
  request: string;
  read: string;
  crop: string | null;
}

export interface SendHelpOutput {
  id: string;
  helpers: string[];
  photo: string | null;
}

export interface PollInput {
  key: string;
}

export interface PulseInput {
  everyMs: number;
}

export const pairHelper = fromPromise<PairHelperOutput, PairHelperInput>(async ({ input }) => {
  const started = Date.now();
  const paired = await relayPair(input.name);
  logIttro(`helper pair for ${JSON.stringify(input.name)} in ${Date.now() - started} ms`);
  return { name: input.name, code: paired.code, expiresAt: paired.expiresAt };
});

async function resolvePhoto(crop: string | null): Promise<{ image: string; photo: string | null }> {
  if (crop && crop.startsWith('data:image/jpeg;base64,')) {
    return { image: crop.slice('data:image/jpeg;base64,'.length), photo: crop };
  }
  const shot = await takeCameraShot();
  if (!shot) {
    throw new Error('no camera shot for the helper');
  }
  const prepared = await prepareShelfPhoto(shot);
  if (!prepared) {
    throw new Error('no photo for the helper');
  }
  return { image: prepared.photo, photo: `data:image/jpeg;base64,${prepared.photo}` };
}

export const sendHelp = fromPromise<SendHelpOutput, SendHelpInput>(async ({ input }) => {
  const started = Date.now();
  const { image, photo } = await resolvePhoto(input.crop);
  logIttro(`helper photo ready in ${Date.now() - started} ms`);
  const asked = await askHelper({
    tokens: input.tokens,
    question: input.question,
    request: input.request,
    read: input.read,
    image,
    mime: 'image/jpeg',
  });
  logIttro(`helper ask sent to ${asked.helpers.length} in ${Date.now() - started} ms`);
  return { id: asked.id, helpers: asked.helpers, photo };
});

export const pairPoll = fromCallback<ConversationEvent, PollInput>(({ sendBack, input }) => {
  let done = false;
  const timer = setInterval(() => {
    if (done) {
      return;
    }
    pairStatus(input.key)
      .then((status) => {
        if (done) {
          return;
        }
        if (status.state === 'joined' && status.token) {
          done = true;
          clearInterval(timer);
          logIttro(`helper joined: ${JSON.stringify(status.helper)}`);
          sendBack({ type: 'HELPER_JOINED', name: status.helper ?? '', token: status.token });
        } else if (status.state === 'unknown') {
          done = true;
          clearInterval(timer);
          logIttro('helper code expired');
          sendBack({ type: 'HELPER_PAIR_EXPIRED' });
        }
      })
      .catch((err: unknown) => {
        logIttro(`helper pair poll failed: ${String((err as Error)?.message ?? err)}`);
      });
  }, 3000);
  return () => {
    done = true;
    clearInterval(timer);
  };
});

export const answerPoll = fromCallback<ConversationEvent, PollInput>(({ sendBack, input }) => {
  let done = false;
  const timer = setInterval(() => {
    if (done) {
      return;
    }
    helperStatus(input.key)
      .then((status) => {
        if (done || !status.answer) {
          return;
        }
        if (status.status === 'answered') {
          done = true;
          clearInterval(timer);
          logIttro(`helper answered: ${status.answer.verdict}`);
          sendBack({
            type: 'HELPER_ANSWER',
            verdict: status.answer.verdict,
            note: status.answer.note,
            helper: status.answer.helper,
          });
        }
      })
      .catch((err: unknown) => {
        const message = String((err as Error)?.message ?? err);
        if (message === 'unknown question') {
          done = true;
          clearInterval(timer);
          sendBack({ type: 'HELPER_TIMEOUT', names: [] });
          return;
        }
        logIttro(`helper answer poll failed: ${message}`);
      });
  }, 3000);
  return () => {
    done = true;
    clearInterval(timer);
  };
});

export const pulseTick = fromCallback<ConversationEvent, PulseInput>(({ input }) => {
  const timer = setInterval(() => playSound('helperPulse'), input.everyMs);
  return () => clearInterval(timer);
});
