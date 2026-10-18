package com.ainsta.collector;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.provider.Settings;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.text.InputType;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class MainActivity extends Activity {
    private LinearLayout profileList;
    private TextView headerCount;
    private TextView profileCount;
    private TextView overlayStatus;
    private TextView accessibilityStatus;
    private TextView storageStatus;
    private EditText searchInput;
    private List<Profile> loadedProfiles = new ArrayList<>();
    private boolean keyboardVisible;
    private int scrollBeforeKeyboard;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        setContentView(buildScreen());
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (profileList != null) refreshScreen();
    }

    private View buildScreen() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.WHITE);
        scroll.setClipToPadding(true);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int horizontalPadding = UiStyles.dp(this, 20);
        int baseTopPadding = UiStyles.dp(this, 10);
        int baseBottomPadding = UiStyles.dp(this, 14);
        content.setPadding(horizontalPadding, baseTopPadding, horizontalPadding, baseBottomPadding);
        scroll.setOnApplyWindowInsetsListener((view, insets) -> {
            int topInset;
            int bottomInset;
            boolean imeVisible;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars());
                android.graphics.Insets ime = insets.getInsets(android.view.WindowInsets.Type.ime());
                topInset = bars.top;
                bottomInset = Math.max(bars.bottom, ime.bottom);
                imeVisible = ime.bottom > bars.bottom;
            } else {
                topInset = insets.getSystemWindowInsetTop();
                bottomInset = insets.getSystemWindowInsetBottom();
                imeVisible = bottomInset > UiStyles.dp(this, 160);
            }
            view.setPadding(0, topInset, 0, bottomInset);
            content.setPadding(horizontalPadding, baseTopPadding, horizontalPadding, baseBottomPadding);
            updateKeyboardState(scroll, imeVisible);
            return insets;
        });
        scroll.addView(content);
        scroll.post(scroll::requestApplyInsets);

        content.addView(buildHeader());
        content.addView(UiStyles.rule(this, Color.BLACK, 1));
        content.addView(spacer(20));
        content.addView(UiStyles.utility(this, "PROFILE CATALOG"));
        TextView title = UiStyles.text(this, "Capture profiles", 24, Color.BLACK, true);
        title.setLetterSpacing(-0.02f);
        content.addView(title, margin(0, 5, 0, 0));
        TextView description = UiStyles.text(this, "Keep a clean, deduplicated list of Instagram usernames. Tap the small AInsta square while a profile is open.", 15, Color.BLACK, false);
        description.setLineSpacing(UiStyles.dp(this, 2), 1.0f);
        content.addView(description, margin(0, 10, 0, 0));

        content.addView(spacer(20));
        content.addView(UiStyles.utility(this, "CAPTURE SETUP"));
        content.addView(buildPermissionRow("OVERLAY PERMISSION", "Allows the AInsta square to stay visible over Instagram.", true));
        content.addView(buildPermissionRow("ACCESSIBILITY ACCESS", "Reads only the visible profile UI after you tap the square.", false));

        content.addView(spacer(22));
        LinearLayout heading = new LinearLayout(this);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.setOrientation(LinearLayout.HORIZONTAL);
        TextView saved = UiStyles.text(this, "Saved profiles", 24, Color.BLACK, true);
        saved.setLetterSpacing(-0.02f);
        heading.addView(saved, new LinearLayout.LayoutParams(0, -2, 1));
        profileCount = UiStyles.utility(this, "0 PROFILES");
        heading.addView(profileCount);
        content.addView(heading);

        searchInput = buildSearchInput();
        LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(-1, UiStyles.dp(this, 56));
        searchParams.setMargins(0, UiStyles.dp(this, 10), 0, 0);
        content.addView(searchInput, searchParams);

        profileList = new LinearLayout(this);
        profileList.setOrientation(LinearLayout.VERTICAL);
        content.addView(profileList, margin(0, 10, 0, 0));

        content.addView(spacer(18));
        content.addView(UiStyles.rule(this, Color.BLACK, 1));
        storageStatus = UiStyles.text(this, "Stored in Documents/AInsta/profiles.json", 11, 0xFF555555, false);
        storageStatus.setLineSpacing(UiStyles.dp(this, 2), 1.0f);
        content.addView(storageStatus, margin(0, 10, 0, 0));
        TextView privacy = UiStyles.text(this, "AInsta does not save screenshots, captions, bios, or direct messages.", 11, 0xFF555555, false);
        privacy.setLineSpacing(UiStyles.dp(this, 2), 1.0f);
        content.addView(privacy, margin(0, 4, 0, 0));
        return scroll;
    }

    private void updateKeyboardState(ScrollView scroll, boolean nowVisible) {
        if (nowVisible == keyboardVisible) return;
        keyboardVisible = nowVisible;
        if (nowVisible) {
            scrollBeforeKeyboard = scroll.getScrollY();
            scroll.postDelayed(() -> {
                if (!keyboardVisible || searchInput == null) return;
                int target = Math.max(0, searchInput.getTop() - UiStyles.dp(this, 100));
                scroll.smoothScrollTo(0, target);
            }, 100L);
        } else {
            scroll.postDelayed(() -> {
                if (!keyboardVisible) scroll.smoothScrollTo(0, scrollBeforeKeyboard);
            }, 100L);
        }
    }

    private View buildHeader() {
        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.BOTTOM);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setPadding(0, 0, 0, UiStyles.dp(this, 12));

        LinearLayout brand = new LinearLayout(this);
        brand.setOrientation(LinearLayout.VERTICAL);
        TextView wordmark = UiStyles.text(this, "AInsta", 30, Color.BLACK, true);
        wordmark.setLetterSpacing(-0.05f);
        brand.addView(wordmark);
        brand.addView(UiStyles.utility(this, "PROFILE COLLECTOR"), margin(0, 3, 0, 0));
        header.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));

        headerCount = UiStyles.utility(this, "0 PROFILES");
        header.addView(headerCount);
        return header;
    }

    private View buildPermissionRow(String heading, String explanation, boolean overlay) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(0, UiStyles.dp(this, 14), 0, UiStyles.dp(this, 14));
        row.setBackgroundColor(Color.WHITE);

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = UiStyles.text(this, heading, 15, Color.BLACK, true);
        title.setLetterSpacing(0.02f);
        top.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        TextView status = UiStyles.utility(this, "CHECKING");
        top.addView(status);
        if (overlay) overlayStatus = status; else accessibilityStatus = status;
        row.addView(top);

        TextView copy = UiStyles.text(this, explanation, 12, 0xFF555555, false);
        copy.setLineSpacing(UiStyles.dp(this, 2), 1.0f);
        row.addView(copy, margin(0, 5, 0, 10));
        String action = overlay ? "GRANT OVERLAY" : "OPEN ACCESSIBILITY SETTINGS";
        row.addView(UiStyles.button(this, action, ignored -> {
            if (overlay) openOverlaySettings(); else openAccessibilitySettings();
        }, true), new LinearLayout.LayoutParams(-1, UiStyles.dp(this, 48)));
        row.addView(UiStyles.rule(this, 0xFFDDDDDD, 1), ruleMargin(0xFFDDDDDD, 1, 0, 14, 0, 0));
        return row;
    }

    private void refreshScreen() {
        loadedProfiles = ProfileStore.read(this);
        String count = loadedProfiles.size() + (loadedProfiles.size() == 1 ? " PROFILE" : " PROFILES");
        if (headerCount != null) headerCount.setText(count);
        if (overlayStatus != null) overlayStatus.setText(Settings.canDrawOverlays(this) ? "READY" : "NEEDS ACCESS");
        if (accessibilityStatus != null) accessibilityStatus.setText(isAccessibilityEnabled() ? "READY" : "NEEDS ACCESS");
        if (storageStatus != null) storageStatus.setText("Stored in " + ProfileStore.storageLocation());
        renderProfiles();
    }

    private EditText buildSearchInput() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setTextSize(15);
        input.setTextColor(Color.BLACK);
        input.setHintTextColor(0xFF777777);
        input.setHint("Search username or profile URL");
        input.setContentDescription("Search saved profiles");
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setPadding(UiStyles.dp(this, 14), 0, UiStyles.dp(this, 14), 0);
        input.setBackground(UiStyles.outline(this, Color.WHITE, Color.BLACK));
        input.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence text, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence text, int start, int before, int count) {
                renderProfiles();
            }

            @Override
            public void afterTextChanged(Editable editable) {
            }
        });
        return input;
    }

    private void renderProfiles() {
        if (profileList == null) return;
        profileList.removeAllViews();
        if (loadedProfiles.isEmpty()) {
            if (profileCount != null) profileCount.setText("0 PROFILES");
            profileList.addView(buildEmptyState());
            return;
        }

        String query = searchInput == null ? "" : searchInput.getText().toString().trim().toLowerCase(Locale.ROOT);
        query = normalizeSearchQuery(query);
        List<Profile> matches = new ArrayList<>();
        for (Profile profile : loadedProfiles) {
            String url = "instagram.com/" + profile.normalizedUsername + "/";
            String searchable = ("@" + profile.username + " " + profile.normalizedUsername + " " + url)
                    .toLowerCase(Locale.ROOT);
            if (query.isEmpty() || searchable.contains(query)) matches.add(profile);
        }

        if (profileCount != null) {
            if (query.isEmpty()) {
                profileCount.setText(loadedProfiles.size() + (loadedProfiles.size() == 1 ? " PROFILE" : " PROFILES"));
            } else {
                profileCount.setText(matches.size() + (matches.size() == 1 ? " MATCH" : " MATCHES"));
            }
        }
        if (matches.isEmpty()) {
            profileList.addView(buildNoMatchesState());
            return;
        }
        for (Profile profile : matches) profileList.addView(buildProfileRow(profile));
    }

    private String normalizeSearchQuery(String query) {
        String normalized = query.trim();
        if (normalized.startsWith("@")) normalized = normalized.substring(1);
        if (normalized.startsWith("https://")) normalized = normalized.substring(8);
        else if (normalized.startsWith("http://")) normalized = normalized.substring(7);
        if (normalized.startsWith("www.")) normalized = normalized.substring(4);
        return normalized;
    }

    private View buildNoMatchesState() {
        LinearLayout empty = new LinearLayout(this);
        empty.setOrientation(LinearLayout.VERTICAL);
        empty.setPadding(0, UiStyles.dp(this, 22), 0, UiStyles.dp(this, 22));
        empty.addView(UiStyles.text(this, "No matching profile", 24, Color.BLACK, true), margin(0, 20, 0, 0));
        empty.addView(UiStyles.text(this, "Try a username, @username, or Instagram profile URL.", 15, Color.BLACK, false), margin(0, 10, 0, 0));
        return empty;
    }

    private View buildEmptyState() {
        LinearLayout empty = new LinearLayout(this);
        empty.setOrientation(LinearLayout.VERTICAL);
        empty.setPadding(0, UiStyles.dp(this, 22), 0, UiStyles.dp(this, 22));
        empty.addView(UiStyles.text(this, "Nothing saved yet", 24, Color.BLACK, true), margin(0, 20, 0, 0));
        empty.addView(UiStyles.text(this, "Open an Instagram profile, then tap the white AInsta square to add its username.", 15, Color.BLACK, false), margin(0, 10, 0, 0));
        return empty;
    }

    private View buildProfileRow(Profile profile) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(0, UiStyles.dp(this, 14), 0, UiStyles.dp(this, 14));
        row.addView(UiStyles.text(this, "@" + profile.username, 16, Color.BLACK, true));
        row.addView(UiStyles.text(this, "instagram.com/" + profile.normalizedUsername + "/", 12, 0xFF555555, false), margin(0, 5, 0, 0));
        row.addView(UiStyles.rule(this, 0xFFDDDDDD, 1), ruleMargin(0xFFDDDDDD, 1, 0, 14, 0, 0));
        return row;
    }

    private void openOverlaySettings() {
        try {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
        } catch (RuntimeException error) {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION));
        }
    }

    private void openAccessibilitySettings() {
        startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
    }

    private boolean isAccessibilityEnabled() {
        String enabled = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (TextUtils.isEmpty(enabled)) return false;
        String expected = new ComponentName(this, AInstaAccessibilityService.class).flattenToString();
        for (String service : enabled.split(":")) if (expected.equalsIgnoreCase(service)) return true;
        return false;
    }

    private View spacer(int height) {
        View view = new View(this);
        view.setLayoutParams(new LinearLayout.LayoutParams(1, UiStyles.dp(this, height)));
        return view;
    }

    private LinearLayout.LayoutParams margin(int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(UiStyles.dp(this, left), UiStyles.dp(this, top), UiStyles.dp(this, right), UiStyles.dp(this, bottom));
        return params;
    }

    private LinearLayout.LayoutParams ruleMargin(int color, int height, int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiStyles.dp(this, height));
        params.setMargins(UiStyles.dp(this, left), UiStyles.dp(this, top), UiStyles.dp(this, right), UiStyles.dp(this, bottom));
        return params;
    }
}
