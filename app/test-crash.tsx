import { View, Text } from 'react-native';

export default function TestCrash() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
      <Text style={{ color: '#fff', fontSize: 24 }}>App Loaded Successfully!</Text>
      <Text style={{ color: '#888', fontSize: 16, marginTop: 20 }}>If you see this, the crash is in a specific component</Text>
    </View>
  );
}
