package com.dedgram.collector;

import org.json.JSONException;
import org.json.JSONObject;

public final class Profile {
    public final String username;
    public final String normalizedUsername;
    public final String firstSeenAt;

    public Profile(String username, String normalizedUsername, String firstSeenAt) {
        this.username = username;
        this.normalizedUsername = normalizedUsername;
        this.firstSeenAt = firstSeenAt;
    }

    public JSONObject toJson() throws JSONException {
        JSONObject object = new JSONObject();
        object.put("username", username);
        object.put("normalized_username", normalizedUsername);
        object.put("first_seen_at", firstSeenAt);
        return object;
    }

    public static Profile fromJson(JSONObject object) {
        String username = object.optString("username", "").trim();
        String normalized = object.optString("normalized_username", "").trim();
        String firstSeenAt = object.optString("first_seen_at", "").trim();
        if (normalized.isEmpty()) normalized = ProfileStore.normalizeUsername(username);
        if (username.isEmpty()) username = normalized;
        return new Profile(username, normalized, firstSeenAt);
    }
}
