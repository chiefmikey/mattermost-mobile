// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect} from 'react';
import {runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue} from 'react-native-reanimated';

/**
 * Drives the show-more collapse/expand animation and exposes the animated cap
 * height as a SharedValue so callers can react to frame-by-frame changes on
 * the UI thread (e.g. to compensate scroll position in lockstep with the
 * animation rather than catching up after the fact).
 *
 * Returns:
 *   animatedStyle  -- apply to the clipping Animated.View
 *   animatedHeight -- SharedValue<number> tracking the live animated maxHeight
 *                     value. Starts at maxHeight (collapsed). During open: ramps
 *                     up to `height` over 300 ms. During close: ramps back to
 *                     maxHeight over 300 ms.
 */
export const useShowMoreAnimatedStyle = (height: number | undefined, maxHeight: number, open: boolean) => {
    // Source-of-truth SharedValue for the current animated clamp height.
    // Driving it via withTiming in a useEffect (rather than inside useAnimatedStyle)
    // means the value lives as a proper SharedValue, visible to useAnimatedReaction
    // in sibling hooks without duplicating the timing state.
    const animatedHeight = useSharedValue(maxHeight);

    useEffect(() => {
        if (height === undefined) {
            // Content height not yet measured -- stay at the collapsed cap.
            animatedHeight.value = maxHeight;
            return;
        }

        if (open) {
            // Expand: animate to full content height.
            animatedHeight.value = withTiming(height, {duration: 300});
        } else {
            // Collapse: animate back to the capped height.
            animatedHeight.value = withTiming(maxHeight, {duration: 300});
        }
    }, [open, height, maxHeight]); // eslint-disable-line react-hooks/exhaustive-deps

    const animatedStyle = useAnimatedStyle(() => ({
        maxHeight: animatedHeight.value,
    }));

    return {animatedStyle, animatedHeight};
};

/**
 * Watches `animatedHeight` (from useShowMoreAnimatedStyle) on the UI thread
 * frame-by-frame and calls `compensateScroll` with the incremental delta on
 * each frame where the height changes.
 *
 * This achieves zero-drift scroll compensation: instead of firing a single
 * scrollToOffset jump after the animation ends (old approach), we compensate
 * the list scroll by exactly the same number of pixels the expander grew (or
 * shrank) that frame, so the visual position under the user's eye stays fixed.
 *
 * Direction math:
 *   Inverted FlatList: contentOffset.y = 0 at newest (visual bottom).
 *   Scrolling toward older content increases contentOffset.y.
 *   A row growing by Δ px pushes viewport toward older content (offset += Δ).
 *   To cancel this, PostList decreases the offset by Δ (offset -= Δ).
 *   compensateScroll receives a positive Δ when expanding, negative when
 *   collapsing; PostList applies the same sign-convention in its callback.
 *
 * Edge cases:
 *   - First-frame initialization: we track `prevHeight` starting at
 *     `animatedHeight.value` so the initial assignment produces Δ = 0.
 *   - Multiple expanders animating simultaneously: each instance has its own
 *     useAnimatedReaction; both deltas are applied independently on the UI
 *     thread. Net result is correct because each frame's compensation from
 *     each expander adds up to the total content growth that frame.
 *   - Off-screen expansion: compensation still runs -- the expander still
 *     shifts the visible content even if the post itself isn't in view.
 *   - Collapsing (Show Less): animatedHeight ramps DOWN, deltas are negative,
 *     PostList decreases offset further (toward newer content) which undoes
 *     the visual jump that collapsing would otherwise cause.
 */
export const useShowMoreScrollCompensation = (
    animatedHeight: SharedValue<number>,
    compensateScroll: (delta: number) => void,
) => {
    // Track the height from the previous frame. Initialise to the current
    // value so the very first reaction produces Δ = 0 and doesn't scroll.
    const prevHeight = useSharedValue(animatedHeight.value);

    useAnimatedReaction(
        () => animatedHeight.value,
        (currentHeight) => {
            'worklet';
            const delta = currentHeight - prevHeight.value;
            prevHeight.value = currentHeight;

            // Only call runOnJS when the height actually changed this frame.
            // Avoids unnecessary JS bridge crossings during idle frames.
            if (delta !== 0) {
                runOnJS(compensateScroll)(delta);
            }
        },
        [compensateScroll],
    );
};
