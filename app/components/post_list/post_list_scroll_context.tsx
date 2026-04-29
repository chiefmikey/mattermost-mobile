// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {createContext, useContext} from 'react';

/**
 * Context that exposes a scroll-compensation callback to show-more expanders
 * deep in the post tree, without threading props through every intermediate layer.
 *
 * The callback is created in PostList, which owns the FlatList ref and the
 * Reanimated scrollPosition SharedValue. When an expander animates open or
 * closed it calls compensateScroll with the incremental height delta for that
 * frame, and PostList adjusts the FlatList's contentOffset by that delta so
 * visible content stays locked to the user's eye.
 */
interface PostListScrollContextType {
    compensateScroll: (delta: number) => void;
}

const noop = (_delta: number) => {/* no-op until provider mounts */};

const PostListScrollContext = createContext<PostListScrollContextType>({
    compensateScroll: noop,
});

export const PostListScrollProvider = PostListScrollContext.Provider;

export const usePostListScrollContext = () => useContext(PostListScrollContext);
