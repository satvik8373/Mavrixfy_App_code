import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, StyleSheet, LayoutChangeEvent } from "react-native";

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
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Stop any existing animation
    if (animationRef.current) {
      animationRef.current.stop();
      animatedValue.setValue(0);
    }

    // Check if text overflows container
    const shouldScroll = textWidth > containerWidth && containerWidth > 0 && textWidth > 0;
    
    if (shouldScroll) {
      setNeedsScroll(true);
      const distance = textWidth - containerWidth + 30; // Add extra padding
      const duration = (distance / velocity) * 1000;

      const animation = Animated.loop(
        Animated.sequence([
          Animated.delay(1500), // Initial delay
          Animated.timing(animatedValue, {
            toValue: -distance,
            duration: duration,
            useNativeDriver: true,
          }),
          Animated.delay(1000), // Pause at end
          Animated.timing(animatedValue, {
            toValue: 0,
            duration: duration,
            useNativeDriver: true,
          }),
          Animated.delay(1000), // Pause at start
        ])
      );

      animationRef.current = animation;
      animation.start();

      return () => {
        animation.stop();
      };
    } else {
      setNeedsScroll(false);
    }
  }, [containerWidth, textWidth, velocity, animatedValue, text]);

  const handleContainerLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== containerWidth) {
      setContainerWidth(width);
    }
  };

  const handleTextLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== textWidth) {
      setTextWidth(width);
    }
  };

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      <Animated.Text
        style={[
          styles.text,
          style,
          needsScroll && {
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
