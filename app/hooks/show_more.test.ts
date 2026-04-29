// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {renderHook} from '@testing-library/react-hooks';
import {withTiming} from 'react-native-reanimated';

import {useShowMoreAnimatedStyle} from './show_more';

jest.mock('react-native-reanimated', () => {
    return {
        useSharedValue: (initial: any) => ({value: initial}),
        useAnimatedStyle: (worklet: () => any) => worklet(),
        useAnimatedReaction: jest.fn(),
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
