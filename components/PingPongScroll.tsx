import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";

interface PingPongScrollProps {
  text: string;
  className?: string;
  style?: any;
  velocity?: number;
}

export const PingPongScroll: React.FC<PingPongScrollProps> = ({
  text,
  className,
  style,
  velocity = 15,
}) => {
  const [needsScroll, setNeedsScroll] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (needsScroll && containerWidth > 0 && textWidth > 0) {
      const distance = textWidth - containerWidth;
      const duration = (distance / velocity) * 1000;

      const animation = Animated.loop(
        Animated.sequence([
          Animated.delay(2000),
          Animated.timing(animatedValue, {
            toValue: -distance,
            duration: duration,
            useNativeDriver: true,
          }),
          Animated.delay(1000),
          Animated.timing(animatedValue, {
            toValue: 0,
            duration: duration,
            useNativeDriver: true,
          }),
        ])
      );

      animation.start();

      return () => {
        animation.stop();
      };
    }
  }, [needsScroll, containerWidth, textWidth, velocity, animatedValue]);

  const handleContainerLayout = (event: any) => {
    const { width } = event.nativeEvent.layout;
    setContainerWidth(width);
  };

  const handleTextLayout = (event: any) => {
    const { width } = event.nativeEvent.layout;
    setTextWidth(width);
    setNeedsScroll(width > containerWidth);
  };

  if (!needsScroll) {
    return (
      <View style={styles.container} onLayout={handleContainerLayout}>
        <Text
          style={[styles.text, style]}
          numberOfLines={1}
          onLayout={handleTextLayout}
        >
          {text}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      <Animated.Text
        style={[
          styles.text,
          style,
          {
            transform: [{ translateX: animatedValue }],
          },
        ]}
        numberOfLines={1}
        onLayout={handleTextLayout}
      >
        {text}
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    width: "100%",
  },
  text: {
    flexShrink: 0,
  },
});
