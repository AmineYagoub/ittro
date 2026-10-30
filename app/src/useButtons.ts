// Wires the earbud button and volume holds into the conversation:
// native presses become BUTTON_PRESS events and earbud changes
// become EARBUD_STATE, so the statechart answers them like words.
import { useEffect } from 'react';
import { addButtonListener, addEarbudListener, earbudState, setButtonsActive } from 'ittro-sensors';
import { logIttro } from './log';
import type { ButtonGesture } from './conversation/types';

interface ButtonActor {
  send: (event: { type: 'BUTTON_PRESS'; gesture: ButtonGesture } | { type: 'EARBUD_STATE'; connected: boolean }) => void;
}

export function useButtons(actorRef: { current: ButtonActor | null }): void {
  useEffect(() => {
    setButtonsActive(true);
    const initial = earbudState();
    logIttro(`buttons active, earbuds ${JSON.stringify(initial)}`);
    if (initial) {
      actorRef.current?.send({ type: 'EARBUD_STATE', connected: initial.connected });
    }
    const button = addButtonListener((press) => {
      actorRef.current?.send({ type: 'BUTTON_PRESS', gesture: press.gesture });
    });
    const earbuds = addEarbudListener((state) => {
      actorRef.current?.send({ type: 'EARBUD_STATE', connected: state.connected });
    });
    return (): void => {
      button?.remove();
      earbuds?.remove();
      setButtonsActive(false);
    };
  }, [actorRef]);
}
