// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {renderHook, act} from '@testing-library/react-hooks';
import {withTiming} from 'react-native-reanimated';

import {useShowMoreAnimatedStyle, useShowMoreScrollCompensation} from './show_more';

// animatedReactionCallback is updated each time useAnimatedReaction is called so
// tests can drive the reaction synchronously by invoking it with a new height.
// This simulates Reanimated's UI-thread frame-by-frame dispatch without running
// the actual Reanimated runtime.
type ReactionCallback = (currentValue: number) => void;
let capturedReactionCallback: ReactionCallback | null = null;

jest.mock('react-native-reanimated', () => {
    return {
        useSharedValue: (initial: any) => ({value: initial}),
        useAnimatedStyle: (worklet: () => any) => worklet(),

        // Capture the reaction callback so tests can fire it synchronously.
        // The prepare fn is called immediately to get the initial value; the
        // callback is stored so tests can invoke it with arbitrary heights.
        useAnimatedReaction: (prepare: () => any, callback: (value: any) => void) => {
            capturedReactionCallback = callback;
        },

        // In the Reanimated mock runOnJS(fn) returns fn directly, meaning
        // the worklet code that calls runOnJS(compensateScroll)(delta) will
        // invoke compensateScroll synchronously in tests.
        runOnJS: (fn: (...args: any[]) => any) => fn,
        withTiming: jest.fn((value) => value),
    };
});

describe('useShowMoreAnimatedStyle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns an animatedStyle and animatedHeight SharedValue', () => {
        const maxHeight = 100;
        const {result} = renderHook(() =>
            useShowMoreAnimatedStyle(undefined, maxHeight, false),
        );

        expect(result.current.animatedStyle).toBeDefined();
        expect(result.current.animatedHeight).toBeDefined();
        expect(result.current.animatedHeight.value).toBe(maxHeight);
    });

    it('calls withTiming(maxHeight) when not open and content is taller than cap', () => {
        const height = 200;
        const maxHeight = 100;
        renderHook(() => useShowMoreAnimatedStyle(height, maxHeight, false));

        expect(withTiming).toHaveBeenCalledWith(maxHeight, {duration: 300});
    });

    it('calls withTiming(height) when open and content is taller than cap', () => {
        const height = 200;
        const maxHeight = 100;
        renderHook(() => useShowMoreAnimatedStyle(height, maxHeight, true));

        expect(withTiming).toHaveBeenCalledWith(height, {duration: 300});
    });

    it('does not call withTiming when height is undefined', () => {
        const maxHeight = 100;
        renderHook(() => useShowMoreAnimatedStyle(undefined, maxHeight, false));

        expect(withTiming).not.toHaveBeenCalled();
    });
});

describe('useShowMoreScrollCompensation', () => {
    // Reset the captured callback between tests so previous tests don't bleed over.
    beforeEach(() => {
        capturedReactionCallback = null;
        jest.clearAllMocks();
    });

    // Helper: fire the reaction callback with the given value, simulating a
    // single Reanimated UI-thread frame where animatedHeight changed to `newValue`.
    const fireFrame = (newValue: number) => {
        act(() => {
            capturedReactionCallback!(newValue);
        });
    };

    it('does not call compensateScroll on mount (no spurious first call)', () => {
        // prevHeight is seeded to animatedHeight.value on mount, so the first
        // reaction produces delta = currentHeight - prevHeight = 0 and the
        // guard (delta !== 0) suppresses the runOnJS call.
        const compensateScroll = jest.fn();
        const animatedHeight = {value: 300};

        renderHook(() => useShowMoreScrollCompensation(animatedHeight, compensateScroll));

        // Simulate the first frame: height unchanged from the initial value.
        fireFrame(300);

        expect(compensateScroll).not.toHaveBeenCalled();
    });

    it('calls compensateScroll with positive delta when post expands', () => {
        // When animatedHeight increases (post opening), delta is positive.
        // PostList uses this to decrease contentOffset, keeping the viewport steady.
        const compensateScroll = jest.fn();
        const animatedHeight = {value: 100};

        renderHook(() => useShowMoreScrollCompensation(animatedHeight, compensateScroll));

        // Simulate a frame where the height grew by 200 px.
        fireFrame(300);

        expect(compensateScroll).toHaveBeenCalledTimes(1);
        expect(compensateScroll).toHaveBeenCalledWith(200);
    });

    it('calls compensateScroll with negative delta when post collapses', () => {
        // When animatedHeight decreases (post closing / Show Less), delta is
        // negative.  PostList subtracts this negative value (i.e. increases
        // contentOffset) to keep the viewport steady in the reverse direction.
        const compensateScroll = jest.fn();
        const animatedHeight = {value: 500};

        renderHook(() => useShowMoreScrollCompensation(animatedHeight, compensateScroll));

        // Simulate a frame where the height shrank by 200 px.
        fireFrame(300);

        expect(compensateScroll).toHaveBeenCalledTimes(1);
        expect(compensateScroll).toHaveBeenCalledWith(-200);
    });

    it('calls compensateScroll once per frame with incremental deltas', () => {
        // Verifies that multi-frame animations accumulate correctly: each frame
        // sends only its incremental delta, not the total since animation start.
        // Stepping 100 → 150 → 200 should produce calls of +50 then +50, not
        // a single call of +100.
        const compensateScroll = jest.fn();
        const animatedHeight = {value: 100};

        renderHook(() => useShowMoreScrollCompensation(animatedHeight, compensateScroll));

        // Frame 1: height advances from 100 to 150 (+50).
        fireFrame(150);

        // Frame 2: height advances from 150 to 200 (+50).
        fireFrame(200);

        expect(compensateScroll).toHaveBeenCalledTimes(2);
        expect(compensateScroll).toHaveBeenNthCalledWith(1, 50);
        expect(compensateScroll).toHaveBeenNthCalledWith(2, 50);
    });
});
