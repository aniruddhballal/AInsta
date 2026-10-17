package com.ainsta.collector;

import android.accessibilityservice.AccessibilityService;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.TextView;
import android.widget.Toast;

public final class AInstaAccessibilityService extends AccessibilityService {
    private static final String INSTAGRAM_PACKAGE = "com.instagram.android";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WindowManager windowManager;
    private TextView bubble;
    private boolean bubbleAttached;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        mainHandler.post(this::showBubble);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (bubble == null) mainHandler.post(this::showBubble);
    }

    @Override
    public void onInterrupt() {
        // The service has no active gesture or speech operation to cancel.
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        removeBubble();
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        removeBubble();
        super.onDestroy();
    }

    private void showBubble() {
        if (bubbleAttached || windowManager == null) return;
        TextView view = new TextView(this);
        view.setText("A");
        view.setTextColor(0xFF000000);
        view.setTextSize(16);
        view.setGravity(Gravity.CENTER);
        view.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD);
        view.setContentDescription("AInsta capture profile");
        view.setBackground(bubbleBackground());
        view.setElevation(dp(4));
        view.setOnClickListener(ignored -> captureCurrentProfile(view));

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                dp(44),
                dp(44),
                overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = dp(16);
        params.y = dp(220);
        params.setTitle("AInsta capture bubble");
        try {
            windowManager.addView(view, params);
            bubble = view;
            bubbleAttached = true;
        } catch (WindowManager.BadTokenException | SecurityException ignored) {
            if (overlayType() == WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY) {
                addAccessibilityOverlay(view, params);
            }
        }
    }

    private void addAccessibilityOverlay(TextView view, WindowManager.LayoutParams params) {
        params.type = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY;
        try {
            windowManager.addView(view, params);
            bubble = view;
            bubbleAttached = true;
        } catch (RuntimeException ignored) {
            // The system may be tearing the accessibility service down.
        }
    }

    private int overlayType() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && Settings.canDrawOverlays(this)
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY;
    }

    private void captureCurrentProfile(TextView source) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || !INSTAGRAM_PACKAGE.equals(String.valueOf(root.getPackageName()))) {
            showMessage("Open an Instagram profile first");
            if (root != null) root.recycle();
            return;
        }
        String username = InstagramUsernameExtractor.extract(root);
        root.recycle();
        if (username.isEmpty()) {
            showMessage("Could not identify this profile");
            return;
        }
        boolean added = ProfileStore.addIfAbsent(getApplicationContext(), username);
        showMessage(added ? "Saved @" + username : "Already saved @" + username);
        source.setText(added ? "✓" : "A");
        mainHandler.postDelayed(() -> {
            if (source == bubble) source.setText("A");
        }, 1200);
    }

    private void showMessage(String message) {
        Toast.makeText(getApplicationContext(), message, Toast.LENGTH_SHORT).show();
    }

    private GradientDrawable bubbleBackground() {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(0xFFFFFFFF);
        drawable.setStroke(dp(1), 0xFF000000);
        drawable.setCornerRadius(0);
        return drawable;
    }

    private void removeBubble() {
        if (bubble != null && bubbleAttached && windowManager != null) {
            try {
                windowManager.removeView(bubble);
            } catch (IllegalArgumentException ignored) {
                // The window may already have been removed by the system.
            }
        }
        bubble = null;
        bubbleAttached = false;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
