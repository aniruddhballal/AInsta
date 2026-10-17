package com.ainsta.collector;

import android.graphics.Rect;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class InstagramUsernameExtractor {
    private static final Pattern USERNAME_PATTERN = Pattern.compile("@?([A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9])?)");
    private static final Pattern PROFILE_DESCRIPTION = Pattern.compile("(?i)(?:profile|avatar|picture)(?:[^@A-Za-z0-9._]{0,24})(?:of|for)?(?:[^@A-Za-z0-9._]{0,4})@?([A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9])?)");
    private static final String[] REJECTED = {
            "instagram", "followers", "following", "follow", "message", "editprofile", "edit profile",
            "share profile", "threads", "home", "search", "reels", "shop", "explore", "notifications",
            "direct", "more", "posts", "likes", "comments", "suggested", "add friend"
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
                addCandidate(value, viewId, bounds, false, candidates);
            }
        }
        if (description != null) {
            String value = description.toString().trim();
            if (!value.isEmpty()) {
                allText.add(value);
                Matcher matcher = PROFILE_DESCRIPTION.matcher(value);
                if (matcher.find()) addCandidate(matcher.group(1), viewId, bounds, true, candidates);
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

    private static boolean isRejected(String value) {
        for (String rejected : REJECTED) if (value.equals(rejected) || value.contains(rejected)) return true;
        return value.matches("\\d+");
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
