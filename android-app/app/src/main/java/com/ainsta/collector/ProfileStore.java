package com.ainsta.collector;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

public final class ProfileStore {
    private static final String FILE_NAME = "profiles.json";
    private static final String RELATIVE_PATH = Environment.DIRECTORY_DOCUMENTS + "/AInsta";
    // Instagram permits usernames to end in an underscore, but not a period.
    private static final Pattern USERNAME_PATTERN = Pattern.compile("[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9_])?");
    private static final Object LOCK = new Object();

    private ProfileStore() {}

    public static String storageLocation() {
        return RELATIVE_PATH + "/" + FILE_NAME;
    }

    public static String normalizeUsername(String value) {
        if (value == null) return "";
        String normalized = value.trim();
        if (normalized.startsWith("@")) normalized = normalized.substring(1);
        normalized = normalized.toLowerCase(Locale.ROOT);
        if (normalized.length() > 30 || !USERNAME_PATTERN.matcher(normalized).matches()) return "";
        return normalized;
    }

    public static List<Profile> read(Context context) {
        synchronized (LOCK) {
            Uri uri = findFile(context.getContentResolver());
            if (uri == null) return new ArrayList<>();
            try (InputStream input = context.getContentResolver().openInputStream(uri)) {
                if (input == null) return new ArrayList<>();
                String json = new String(readAll(input), StandardCharsets.UTF_8);
                return parse(json);
            } catch (IOException | JSONException ignored) {
                return new ArrayList<>();
            }
        }
    }

    public static boolean addIfAbsent(Context context, String username) {
        String normalized = normalizeUsername(username);
        if (normalized.isEmpty()) return false;
        synchronized (LOCK) {
            List<Profile> profiles = read(context);
            Set<String> seen = new HashSet<>();
            for (Profile profile : profiles) {
                if (!profile.normalizedUsername.isEmpty()) seen.add(profile.normalizedUsername);
            }
            if (seen.contains(normalized)) return false;
            profiles.add(new Profile(username.trim().replaceFirst("^@", ""), normalized, Long.toString(System.currentTimeMillis())));
            return write(context, profiles);
        }
    }

    private static List<Profile> parse(String json) throws JSONException {
        List<Profile> profiles = new ArrayList<>();
        if (json == null || json.trim().isEmpty()) return profiles;
        JSONArray array = new JSONObject(json).optJSONArray("profiles");
        if (array == null) return profiles;
        Set<String> seen = new HashSet<>();
        for (int index = 0; index < array.length(); index += 1) {
            Profile profile = Profile.fromJson(array.getJSONObject(index));
            String normalized = normalizeUsername(profile.normalizedUsername);
            if (normalized.isEmpty() || seen.contains(normalized)) continue;
            seen.add(normalized);
            profiles.add(new Profile(profile.username, normalized, profile.firstSeenAt));
        }
        return profiles;
    }

    private static boolean write(Context context, List<Profile> profiles) {
        ContentResolver resolver = context.getContentResolver();
        Uri uri = findFile(resolver);
        boolean pending = false;
        if (uri == null) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, FILE_NAME);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, RELATIVE_PATH);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            uri = resolver.insert(MediaStore.Files.getContentUri("external"), values);
            pending = true;
        }
        if (uri == null) return false;
        try (OutputStream output = resolver.openOutputStream(uri, "wt")) {
            if (output == null) return false;
            JSONObject root = new JSONObject();
            root.put("version", 1);
            JSONArray array = new JSONArray();
            for (Profile profile : profiles) array.put(profile.toJson());
            root.put("profiles", array);
            output.write((root.toString(2) + "\n").getBytes(StandardCharsets.UTF_8));
            output.flush();
            if (pending) {
                ContentValues ready = new ContentValues();
                ready.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(uri, ready, null, null);
            }
            return true;
        } catch (IOException | JSONException error) {
            if (pending) resolver.delete(uri, null, null);
            return false;
        }
    }

    private static Uri findFile(ContentResolver resolver) {
        Uri collection = MediaStore.Files.getContentUri("external");
        String[] projection = {MediaStore.MediaColumns._ID};
        String selection = MediaStore.MediaColumns.DISPLAY_NAME + "=? AND " + MediaStore.MediaColumns.RELATIVE_PATH + "=?";
        String[] args = {FILE_NAME, RELATIVE_PATH + "/"};
        try (Cursor cursor = resolver.query(collection, projection, selection, args, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                long id = cursor.getLong(0);
                return Uri.withAppendedPath(collection, Long.toString(id));
            }
        }
        return null;
    }

    private static byte[] readAll(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) >= 0) output.write(buffer, 0, count);
        return output.toByteArray();
    }
}
