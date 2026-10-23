package com.dedgram.collector;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public final class ProfileStoreTest {
    @Test
    public void normalizesCaseAndAtPrefix() {
        assertEquals("creator.name", ProfileStore.normalizeUsername(" @Creator.Name "));
    }

    @Test
    public void acceptsSingleCharacterUsername() {
        assertEquals("a", ProfileStore.normalizeUsername("a"));
    }

    @Test
    public void acceptsUsernameEndingInUnderscore() {
        assertEquals("creator_", ProfileStore.normalizeUsername("@Creator_"));
    }

    @Test
    public void rejectsAmbiguousOrInvalidValues() {
        assertEquals("", ProfileStore.normalizeUsername("profile name"));
        assertEquals("", ProfileStore.normalizeUsername("profile-name"));
        assertEquals("", ProfileStore.normalizeUsername("creator."));
        assertEquals("", ProfileStore.normalizeUsername("1234567890123456789012345678901"));
    }

    @Test
    public void normalizedValueIsStableForDuplicateChecks() {
        String first = ProfileStore.normalizeUsername("Dedgram.Creator");
        String second = ProfileStore.normalizeUsername("@dedgram.creator");
        assertTrue(!first.isEmpty());
        assertEquals(first, second);
    }
}
