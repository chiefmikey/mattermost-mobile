// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// *******************************************************************
// - [#] indicates a test step (e.g. # Go to a screen)
// - [*] indicates an assertion (e.g. * Check the title)
// - Use element testID when selecting an element. Create one if none.
// *******************************************************************

import {
    Post,
    Setup,
} from '@support/server_api';
import {
    serverOneUrl,
    siteOneUrl,
} from '@support/test_config';
import {
    ChannelScreen,
    ChannelListScreen,
    HomeScreen,
    LoginScreen,
    ServerScreen,
} from '@support/ui/screen';
import {getRandomId, isIos, timeouts, wait} from '@support/utils';
import {expect} from 'detox';

describe('Messaging - Message Post', () => {
    const serverOneDisplayName = 'Server 1';
    const channelsCategory = 'channels';
    let testChannel: any;

    beforeAll(async () => {
        const {channel, user} = await Setup.apiInit(siteOneUrl);
        testChannel = channel;

        // # Log in to server
        await ServerScreen.connectToServer(serverOneUrl, serverOneDisplayName);
        await LoginScreen.login(user);
    });

    beforeEach(async () => {
        // * Verify on channel list screen
        await ChannelListScreen.toBeVisible();
    });

    afterAll(async () => {
        // # Log out
        await HomeScreen.logout();
    });

    it('MM-T4782_1 - should be able to post a message when send button is tapped', async () => {
        // # Open a channel screen
        await ChannelScreen.open(channelsCategory, testChannel.name);

        // * Verify send button is disabled
        await expect(ChannelScreen.sendButtonDisabled).toBeVisible();

        // # Create a message draft
        const message = `Message ${getRandomId()}`;
        await ChannelScreen.postInput.tap();
        await ChannelScreen.postInput.replaceText(message);

        // * Verify send button is enabled
        await expect(ChannelScreen.sendButton).toBeVisible();

        // # Tap send button
        await ChannelScreen.sendButton.tap();

        // * Verify message is added to post list, cleared from post draft, and send button is disabled again
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        const {postListPostItem} = ChannelScreen.getPostListPostItem(post.id, message);
        await expect(postListPostItem).toBeVisible();
        await expect(ChannelScreen.postInput).not.toHaveValue(message);
        await expect(ChannelScreen.sendButtonDisabled).toBeVisible();

        // # Go back to channel list screen
        await ChannelScreen.back();
    });

    it('MM-T4782_2 - should be able to post a long message', async () => {
        // # Open a channel screen, post a long message, and a short message after
        const longMessage = 'The quick brown fox jumps over the lazy dog.'.repeat(40);
        await ChannelScreen.open(channelsCategory, testChannel.name);
        await ChannelScreen.postMessage(longMessage);
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        await ChannelScreen.postMessage('short message');

        const {postListPostItem, postListPostItemShowLessButton, postListPostItemShowMoreButton} = ChannelScreen.getPostListPostItem(post.id, longMessage);
        await expect(postListPostItem).toExist();
        await expect(postListPostItemShowMoreButton).toExist();

        // # Tap on show more button on long message post
        await postListPostItemShowMoreButton.tap();
        await wait(timeouts.TWO_SEC);

        // * Verify long message post displays show less button (chevron up button)
        await expect(postListPostItemShowLessButton).toBeVisible();

        // # Go back to channel list screen
        await ChannelScreen.back();
    });

    it('should preserve scroll position when expanding a long post via Show More', async () => {
        // This test validates the fix for the scroll-jump regression: when a user
        // taps Show More on a long post, the FlatList viewport must stay at the
        // same offset throughout the 300 ms withTiming expansion animation.
        //
        // On iOS we read contentOffset before and after tapping Show More and assert
        // the difference is within ±10 px.  The regression produced offsets hundreds
        // of pixels apart because the FlatList jumped to the top of the post.
        //
        // On Android Detox does not expose contentOffset from getAttributes(), so we
        // fall back to a smoke-test: Show More tapped → Show Less button visible.

        // # Open the channel and post a long message
        const longMessage = 'The quick brown fox jumps over the lazy dog.'.repeat(40);
        await ChannelScreen.open(channelsCategory, testChannel.name);
        await ChannelScreen.postMessage(longMessage);
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);

        // Post a short follow-up message so the long post is not at the very
        // bottom of the list; this gives the FlatList room to accumulate a
        // non-zero contentOffset before we tap Show More.
        await ChannelScreen.postMessage('short follow-up message');

        const {postListPostItemShowMoreButton, postListPostItemShowLessButton} = ChannelScreen.getPostListPostItem(post.id, longMessage);

        // * Verify Show More is visible (post rendered in collapsed state)
        await expect(postListPostItemShowMoreButton).toExist();

        const flatList = ChannelScreen.getFlatPostList();

        if (isIos()) {
            // # Read scroll offset BEFORE tapping Show More
            const attrsBefore = await flatList.getAttributes();

            // getAttributes() on a multi-element match returns { elements: [...] };
            // on a single match (our case) it returns the attributes directly.
            // Narrow the union so TypeScript is happy and extract contentOffset.y.
            let offsetBefore = 0;
            if ('contentOffset' in attrsBefore && attrsBefore.contentOffset != null) {
                offsetBefore = attrsBefore.contentOffset.y;
            } else if ('elements' in attrsBefore && attrsBefore.elements[0] != null) {
                const firstEl = attrsBefore.elements[0];
                if ('contentOffset' in firstEl && firstEl.contentOffset != null) {
                    offsetBefore = firstEl.contentOffset.y;
                }
            }

            // # Tap Show More and wait for the 300 ms expansion animation to settle
            await postListPostItemShowMoreButton.tap();
            await wait(timeouts.ONE_SEC);

            // # Read scroll offset AFTER animation completes
            const attrsAfter = await flatList.getAttributes();
            let offsetAfter = 0;
            if ('contentOffset' in attrsAfter && attrsAfter.contentOffset != null) {
                offsetAfter = attrsAfter.contentOffset.y;
            } else if ('elements' in attrsAfter && attrsAfter.elements[0] != null) {
                const firstEl = attrsAfter.elements[0];
                if ('contentOffset' in firstEl && firstEl.contentOffset != null) {
                    offsetAfter = firstEl.contentOffset.y;
                }
            }

            // * Scroll offset must be preserved within ±10 px.
            // The fix applies incremental frame-level compensation that keeps the
            // offset within animation precision.  Without the fix the offset
            // jumps by hundreds of pixels (the full expanded height of the post).
            const drift = Math.abs(offsetAfter - offsetBefore);
            if (drift >= 10) {
                throw new Error(`Scroll position drifted ${drift}px after Show More (expected < 10px). The show-more scroll compensation may be broken.`);
            }

            // * Verify the post is now expanded (Show Less button visible)
            await expect(postListPostItemShowLessButton).toBeVisible();
        } else {
            // Android smoke-test: just verify the tap works and expansion completes.
            await postListPostItemShowMoreButton.tap();
            await wait(timeouts.TWO_SEC);
            await expect(postListPostItemShowLessButton).toBeVisible();
        }

        // # Go back to channel list screen
        await ChannelScreen.back();
    });
});
