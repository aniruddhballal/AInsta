package com.ainsta.collector;

import android.graphics.Rect;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class InstagramUsernameExtractor {
    // Instagram permits usernames to end in an underscore, but not a period.
    private static final Pattern USERNAME_PATTERN = Pattern.compile("@?([A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?)");
    private static final Pattern PROFILE_DESCRIPTION = Pattern.compile("(?i)(?:profile\\s+(?:picture|photo|avatar)|(?:profile|avatar|picture)(?!\\s+(?:picture|photo|avatar)\\b))(?:\\s+(?:of|for))?\\s+@?([A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?)");
    private static final Pattern PROFILE_URL = Pattern.compile("(?i)(?:https?://)?(?:www\\.)?instagram\\.com/([A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?)/?");
    private static final Pattern METRIC_TOKEN = Pattern.compile("(?i)\\d+(?:\\.\\d+)?[kmb]?(?:posts?|followers?|following?|likes?|comments?)");
    private static final String[] REJECTED = {
            "instagram", "followers", "following", "follow", "message", "editprofile", "edit profile",
            "share profile", "threads", "home", "search", "reels", "shop", "explore", "notifications",
            "direct", "more", "posts", "likes", "comments", "suggested", "add friend", "picture", "profile", "avatar"
    };

    private InstagramUsernameExtractor() {}

    public static String extract(AccessibilityNodeInfo root) {
        if (root == null) return "";
        List<Candidate> candidates = new ArrayList<>();
        List<String> allText = new ArrayList<>();
        collect(root, candidates, allText);
        if (!hasProfileSignal(allText)) return "";

        Candidate best = null;
        for (Candidate candidate : candidates) {
            if (best == null || candidate.score > best.score) best = candidate;
        }
        return best == null || best.score < 24 ? "" : best.username;
    }

    private static void collect(AccessibilityNodeInfo node, List<Candidate> candidates, List<String> allText) {
        CharSequence text = node.getText();
        CharSequence description = node.getContentDescription();
        String viewId = node.getViewIdResourceName();
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);

        if (text != null) {
            String value = text.toString().trim();
            if (!value.isEmpty()) {
                allText.add(value);
                String urlUsername = profileUrlUsername(value);
                if (urlUsername.isEmpty()) addCandidate(value, viewId, bounds, false, candidates);
                else addCandidate(urlUsername, viewId, bounds, true, candidates);
            }
        }
        if (description != null) {
            String value = description.toString().trim();
            if (!value.isEmpty()) {
                allText.add(value);
                String profileUsername = profileDescriptionUsername(value);
                if (!profileUsername.isEmpty()) addCandidate(profileUsername, viewId, bounds, true, candidates);
                else addCandidate(value, viewId, bounds, true, candidates);
            }
        }

        for (int index = 0; index < node.getChildCount(); index += 1) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child != null) {
                collect(child, candidates, allText);
                child.recycle();
            }
        }
    }

    static String profileDescriptionUsername(String value) {
        if (value == null) return "";
        Matcher matcher = PROFILE_DESCRIPTION.matcher(value.trim());
        return matcher.find() ? ProfileStore.normalizeUsername(matcher.group(1)) : "";
    }

    private static String profileUrlUsername(String value) {
        Matcher matcher = PROFILE_URL.matcher(value);
        return matcher.find() ? ProfileStore.normalizeUsername(matcher.group(1)) : "";
    }

    private static void addCandidate(String raw, String viewId, Rect bounds, boolean description, List<Candidate> candidates) {
        String value = raw.trim();
        if (value.startsWith("@")) value = value.substring(1);
        if (value.length() > 30 || value.isEmpty() || value.contains(" ") || value.contains("\n")) return;
        Matcher matcher = USERNAME_PATTERN.matcher(value);
        if (!matcher.matches()) return;
        String normalized = ProfileStore.normalizeUsername(matcher.group(1));
        if (normalized.isEmpty() || isRejected(normalized)) return;

        int score = 12;
        String id = viewId == null ? "" : viewId.toLowerCase(Locale.ROOT);
        if (id.contains("username")) score += 45;
        if (id.contains("profile")) score += 18;
        if (id.contains("title")) score += 12;
        if (description) score += 14;
        if (raw.trim().startsWith("@")) score += 15;
        if (bounds.top >= 0 && bounds.top < 900) score += 8;
        if (normalized.length() >= 3) score += 4;
        candidates.add(new Candidate(normalized, score));
    }

    private static boolean hasProfileSignal(List<String> allText) {
        for (String value : allText) {
            String lower = value.toLowerCase(Locale.ROOT);
            if (lower.contains("followers") || lower.contains("following") || lower.contains("edit profile")
                    || lower.equals("follow") || lower.contains("message") || lower.contains("posts")) return true;
        }
        return false;
    }

    static boolean isRejected(String value) {
        // Match only complete UI labels. A substring check incorrectly rejects
        // real usernames such as "reelscantheal" because it contains "reels".
        for (String rejected : REJECTED) if (value.equals(rejected)) return true;
        return value.matches("\\d+") || METRIC_TOKEN.matcher(value).matches();
    }

    private static final class Candidate {
        final String username;
        final int score;

        Candidate(String username, int score) {
            this.username = username;
            this.score = score;
        }
    }
}
