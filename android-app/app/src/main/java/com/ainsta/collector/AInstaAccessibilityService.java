package com.ainsta.collector;

import android.accessibilityservice.AccessibilityService;
import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.Looper;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.TextView;
import android.widget.Toast;

import java.util.HashSet;
import java.util.Set;

public final class AInstaAccessibilityService extends AccessibilityService {
    private static final String INSTAGRAM_PACKAGE = "com.instagram.android";
    private static final String BUBBLE_POSITION_PREFS = "capture_bubble_position";
    private static final String BUBBLE_X = "x";
    private static final String BUBBLE_Y = "y";
    private static final int MAX_CAPTURE_ATTEMPTS = 4;
    private static final long CAPTURE_RETRY_DELAY_MS = 350L;
    private static final long PROFILE_STATE_DELAY_MS = 40L;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Set<String> savedUsernames = new HashSet<>();
    private final Runnable savedProfileStateUpdate = this::updateSavedProfileState;
    private WindowManager windowManager;
    private TextView bubble;
    private boolean bubbleAttached;
    private String observedUsername = "";

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        refreshSavedUsernames();
        mainHandler.post(this::syncBubbleVisibility);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        boolean instagramEvent = INSTAGRAM_PACKAGE.equals(String.valueOf(event.getPackageName()));
        if (instagramEvent) {
            if (bubble == null) mainHandler.post(this::showBubble);
            if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
                mainHandler.removeCallbacks(savedProfileStateUpdate);
                mainHandler.post(savedProfileStateUpdate);
            } else {
                scheduleSavedProfileStateUpdate();
            }
        } else if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                || event.getEventType() == AccessibilityEvent.TYPE_WINDOWS_CHANGED) {
            mainHandler.post(this::syncBubbleVisibility);
        }
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
        view.setText("");
        view.setTextColor(0xFF000000);
        view.setTextSize(16);
        view.setGravity(Gravity.CENTER);
        view.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD);
        view.setContentDescription("AInsta capture profile");
        view.setBackground(new CaptureBubbleDrawable(this));
        view.setElevation(dp(4));
        view.setOnClickListener(ignored -> captureCurrentProfile(view));

        final WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                dp(44),
                dp(44),
                overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = clampPosition(savedBubblePosition(BUBBLE_X, dp(16)), maxBubbleX(params));
        params.y = clampPosition(savedBubblePosition(BUBBLE_Y, dp(220)), maxBubbleY(params));
        params.setTitle("AInsta capture bubble");
        view.setOnTouchListener(new View.OnTouchListener() {
            private final int touchSlop = ViewConfiguration.get(AInstaAccessibilityService.this).getScaledTouchSlop();
            private float downRawX;
            private float downRawY;
            private int startX;
            private int startY;
            private boolean dragging;

            @Override
            public boolean onTouch(View touchedView, MotionEvent event) {
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downRawX = event.getRawX();
                        downRawY = event.getRawY();
                        startX = params.x;
                        startY = params.y;
                        dragging = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float deltaX = event.getRawX() - downRawX;
                        float deltaY = event.getRawY() - downRawY;
                        if (!dragging && Math.hypot(deltaX, deltaY) > touchSlop) dragging = true;
                        if (dragging) {
                            params.x = clampPosition(startX + Math.round(deltaX), maxBubbleX(params));
                            params.y = clampPosition(startY + Math.round(deltaY), maxBubbleY(params));
                            updateBubblePosition(touchedView, params);
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (dragging) {
                            saveBubblePosition(params);
                            dragging = false;
                            return true;
                        }
                        touchedView.performClick();
                        return true;
                    case MotionEvent.ACTION_CANCEL:
                        dragging = false;
                        return true;
                    default:
                        return true;
                }
            }
        });
        try {
            windowManager.addView(view, params);
            bubble = view;
            bubbleAttached = true;
            scheduleSavedProfileStateUpdate();
        } catch (WindowManager.BadTokenException | SecurityException ignored) {
            if (overlayType() == WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY) {
                addAccessibilityOverlay(view, params);
            }
        }
    }

    private void syncBubbleVisibility() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        boolean instagramActive = root != null
                && INSTAGRAM_PACKAGE.equals(String.valueOf(root.getPackageName()));
        if (root != null) root.recycle();
        if (instagramActive) showBubble(); else removeBubble();
    }

    private void addAccessibilityOverlay(TextView view, WindowManager.LayoutParams params) {
        params.type = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY;
        try {
            windowManager.addView(view, params);
            bubble = view;
            bubbleAttached = true;
            scheduleSavedProfileStateUpdate();
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
        captureCurrentProfile(source, 0);
    }

    private void scheduleSavedProfileStateUpdate() {
        mainHandler.removeCallbacks(savedProfileStateUpdate);
        mainHandler.postDelayed(savedProfileStateUpdate, PROFILE_STATE_DELAY_MS);
    }

    private void updateSavedProfileState() {
        if (bubble == null || !bubbleAttached) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || !INSTAGRAM_PACKAGE.equals(String.valueOf(root.getPackageName()))) {
            if (root != null) root.recycle();
            observedUsername = "";
            setBubbleAlreadySaved(false);
            return;
        }
        String username = InstagramUsernameExtractor.extract(root);
        root.recycle();
        if (username.equals(observedUsername)) return;
        observedUsername = username;
        setBubbleAlreadySaved(!username.isEmpty() && savedUsernames.contains(username));
    }

    private void refreshSavedUsernames() {
        savedUsernames.clear();
        for (Profile profile : ProfileStore.read(getApplicationContext())) {
            if (!profile.normalizedUsername.isEmpty()) savedUsernames.add(profile.normalizedUsername);
        }
    }

    private void setBubbleAlreadySaved(boolean alreadySaved) {
        if (bubble == null) return;
        if (bubble.getBackground() instanceof CaptureBubbleDrawable) {
            ((CaptureBubbleDrawable) bubble.getBackground()).setAlreadySaved(alreadySaved);
        }
    }

    private void captureCurrentProfile(TextView source, int attempt) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || !INSTAGRAM_PACKAGE.equals(String.valueOf(root.getPackageName()))) {
            if (root != null) root.recycle();
            if (attempt < MAX_CAPTURE_ATTEMPTS) {
                mainHandler.postDelayed(() -> captureCurrentProfile(source, attempt + 1), CAPTURE_RETRY_DELAY_MS);
            } else {
                showCaptureFailure(source, "Open an Instagram profile first");
            }
            return;
        }
        String username = InstagramUsernameExtractor.extract(root);
        root.recycle();
        if (username.isEmpty()) {
            if (attempt < MAX_CAPTURE_ATTEMPTS) {
                mainHandler.postDelayed(() -> captureCurrentProfile(source, attempt + 1), CAPTURE_RETRY_DELAY_MS);
            } else {
                showCaptureFailure(source, "Could not identify this profile");
            }
            return;
        }
        ProfileStore.SaveResult result = ProfileStore.add(getApplicationContext(), username);
        if (result == ProfileStore.SaveResult.ADDED) {
            savedUsernames.add(username);
            setBubbleAlreadySaved(true);
            showMessage("Saved @" + username);
            if (source == bubble && source.getBackground() instanceof CaptureBubbleDrawable) {
                ((CaptureBubbleDrawable) source.getBackground()).startShimmer();
            }
        } else if (result == ProfileStore.SaveResult.ALREADY_PRESENT) {
            savedUsernames.add(username);
            setBubbleAlreadySaved(true);
            showMessage("Already saved @" + username);
            showAlreadySavedFeedback(source);
        } else {
            showCaptureFailure(source, "Could not save @" + username);
        }
    }

    private void showCaptureFailure(TextView source, String message) {
        showMessage(message);
        showCaptureFailureFeedback(source);
    }

    private void showCaptureFailureFeedback(TextView source) {
        if (source != bubble) return;
        if (source.getBackground() instanceof CaptureBubbleDrawable) {
            ((CaptureBubbleDrawable) source.getBackground()).startFailureFeedback();
        }
        Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(
                    new long[]{0L, 45L, 45L, 45L},
                    new int[]{0, 110, 0, 110},
                    -1
            ));
        } else {
            vibrator.vibrate(new long[]{0L, 45L, 45L, 45L}, -1);
        }
    }

    private void showAlreadySavedFeedback(TextView source) {
        if (source != bubble) return;
        if (source.getBackground() instanceof CaptureBubbleDrawable) {
            ((CaptureBubbleDrawable) source.getBackground()).startAlreadySavedFeedback();
        }
        Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(28L, 70));
        } else {
            vibrator.vibrate(28L);
        }
    }

    private void showMessage(String message) {
        Toast.makeText(getApplicationContext(), message, Toast.LENGTH_SHORT).show();
    }

    private int savedBubblePosition(String key, int fallback) {
        return getSharedPreferences(BUBBLE_POSITION_PREFS, MODE_PRIVATE).getInt(key, fallback);
    }

    private void saveBubblePosition(WindowManager.LayoutParams params) {
        getSharedPreferences(BUBBLE_POSITION_PREFS, MODE_PRIVATE)
                .edit()
                .putInt(BUBBLE_X, params.x)
                .putInt(BUBBLE_Y, params.y)
                .apply();
    }

    private int maxBubbleX(WindowManager.LayoutParams params) {
        return Math.max(0, getResources().getDisplayMetrics().widthPixels - params.width);
    }

    private int maxBubbleY(WindowManager.LayoutParams params) {
        return Math.max(0, getResources().getDisplayMetrics().heightPixels - params.height);
    }

    private int clampPosition(int value, int maximum) {
        return Math.max(0, Math.min(value, maximum));
    }

    private void updateBubblePosition(View view, WindowManager.LayoutParams params) {
        if (!bubbleAttached || windowManager == null) return;
        try {
            windowManager.updateViewLayout(view, params);
        } catch (IllegalArgumentException ignored) {
            // The overlay may have been removed while the gesture was ending.
        }
    }

    private void removeBubble() {
        mainHandler.removeCallbacks(savedProfileStateUpdate);
        if (bubble != null && bubbleAttached && windowManager != null) {
            try {
                windowManager.removeView(bubble);
            } catch (IllegalArgumentException ignored) {
                // The window may already have been removed by the system.
            }
        }
        bubble = null;
        bubbleAttached = false;
        observedUsername = "";
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
