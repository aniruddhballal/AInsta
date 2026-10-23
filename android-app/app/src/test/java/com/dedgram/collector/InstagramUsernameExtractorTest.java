package com.dedgram.collector;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class InstagramUsernameExtractorTest {
    @Test
    public void rejectsPostAndFollowerMetrics() {
        assertTrue(InstagramUsernameExtractor.isRejected("294posts"));
        assertTrue(InstagramUsernameExtractor.isRejected("68.6kfollowers"));
        assertTrue(InstagramUsernameExtractor.isRejected("1.2mcomments"));
    }

    @Test
    public void rejectsAccessibilityLabels() {
        assertTrue(InstagramUsernameExtractor.isRejected("picture"));
        assertTrue(InstagramUsernameExtractor.isRejected("community"));
        assertTrue(InstagramUsernameExtractor.isRejected("profile"));
        assertTrue(InstagramUsernameExtractor.isRejected("reposted"));
    }

    @Test
    public void keepsRealUsernameThatContainsUiLabel() {
        assertFalse(InstagramUsernameExtractor.isRejected("reelscantheal"));
    }

    @Test
    public void extractsUsernameFromProfilePictureDescription() {
        assertEquals("actual_user", InstagramUsernameExtractor.profileDescriptionUsername("Profile picture of @actual_user"));
        assertEquals("actual_user", InstagramUsernameExtractor.profileDescriptionUsername("Profile avatar for actual_user"));
    }

    @Test
    public void doesNotTreatProfilePictureLabelAsUsername() {
        assertEquals("", InstagramUsernameExtractor.profileDescriptionUsername("Profile picture"));
    }
}
