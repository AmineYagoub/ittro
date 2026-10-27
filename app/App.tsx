import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App(): React.JSX.Element {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) {
    return statusScreen('Starting camera…');
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.status}>Ittro needs the camera to see the shelf.</Text>
        <Text style={styles.status} onPress={requestPermission}>
          Tap here, then allow the camera.
        </Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back">
        <View style={styles.overlay}>
          <Text style={styles.status}>Ittro — point at the shelf.</Text>
        </View>
      </CameraView>
      <StatusBar style="auto" />
    </View>
  );
}

function statusScreen(message: string): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.status}>{message}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 48,
  },
  status: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
