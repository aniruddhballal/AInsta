package com.ainsta.collector;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.view.animation.DecelerateInterpolator;

/** Draws the capture bubble and its one-shot success shimmer. */
public final class CaptureBubbleDrawable extends Drawable {
    private static final float ICON_SIZE = 48f;
    private static final long SHIMMER_DURATION_MS = 650L;
    private static final int SAVED_BORDER_COLOR = 0xFFE1E5EA;

    private final Paint backgroundPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint savedHighlightPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint shimmerPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path clipPath = new Path();
    private final Drawable alien;
    private ValueAnimator shimmerAnimator;
    private ValueAnimator pulseAnimator;
    private ValueAnimator failureAnimator;
    private float shimmerCenter = -18f;
    private float pulseScale = 1f;
    private float jitterOffset;
    private boolean alreadySaved;

    public CaptureBubbleDrawable(Context context) {
        backgroundPaint.setColor(Color.BLACK);
        alien = context.getDrawable(R.drawable.ainsta_alien);
    }

    @Override
    public void draw(Canvas canvas) {
        Rect bounds = getBounds();
        if (bounds.isEmpty()) return;

        float scale = Math.min(bounds.width(), bounds.height()) / ICON_SIZE;
        float renderedScale = scale * pulseScale;
        float offsetX = bounds.left + (bounds.width() - ICON_SIZE * renderedScale) / 2f + jitterOffset * scale;
        float offsetY = bounds.top + (bounds.height() - ICON_SIZE * renderedScale) / 2f;

        canvas.save();
        canvas.translate(offsetX, offsetY);
        canvas.scale(renderedScale, renderedScale);

        RectF bubbleBounds = new RectF(0f, 0f, ICON_SIZE, ICON_SIZE);
        canvas.drawRoundRect(bubbleBounds, 12f, 12f, backgroundPaint);
        if (alreadySaved) {
            savedHighlightPaint.setColor(SAVED_BORDER_COLOR);
            savedHighlightPaint.setStyle(Paint.Style.STROKE);
            savedHighlightPaint.setStrokeWidth(1.15f);
            savedHighlightPaint.setStrokeCap(Paint.Cap.ROUND);
            canvas.drawRoundRect(new RectF(2f, 2f, ICON_SIZE - 2f, ICON_SIZE - 2f), 10f, 10f, savedHighlightPaint);
        }

        if (shimmerAnimator != null && shimmerAnimator.isRunning()) {
            clipPath.reset();
            clipPath.addRoundRect(bubbleBounds, 12f, 12f, Path.Direction.CW);
            canvas.save();
            canvas.clipPath(clipPath);
            shimmerPaint.setShader(new LinearGradient(
                    shimmerCenter - 13f,
                    0f,
                    shimmerCenter + 13f,
                    0f,
                    new int[]{0x00FFFFFF, 0x38FFFFFF, 0xD8FFFFFF, 0x38FFFFFF, 0x00FFFFFF},
                    new float[]{0f, 0.28f, 0.5f, 0.72f, 1f},
                    Shader.TileMode.CLAMP
            ));
            canvas.drawRect(0f, 0f, ICON_SIZE, ICON_SIZE, shimmerPaint);
            shimmerPaint.setShader(null);
            canvas.restore();
        }

        alien.setBounds(0, 0, (int) ICON_SIZE, (int) ICON_SIZE);
        alien.draw(canvas);
        canvas.restore();
    }

    public void setAlreadySaved(boolean alreadySaved) {
        if (this.alreadySaved == alreadySaved) return;
        this.alreadySaved = alreadySaved;
        invalidateSelf();
    }

    public void startShimmer() {
        cancelPulseAndFailure();
        if (shimmerAnimator != null) shimmerAnimator.cancel();
        shimmerCenter = -18f;
        shimmerAnimator = ValueAnimator.ofFloat(-18f, ICON_SIZE + 18f);
        shimmerAnimator.setDuration(SHIMMER_DURATION_MS);
        shimmerAnimator.setInterpolator(new DecelerateInterpolator());
        shimmerAnimator.addUpdateListener(animation -> {
            shimmerCenter = (float) animation.getAnimatedValue();
            invalidateSelf();
        });
        shimmerAnimator.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                shimmerAnimator = null;
                shimmerCenter = -18f;
                invalidateSelf();
            }
        });
        shimmerAnimator.start();
    }

    public void startAlreadySavedFeedback() {
        if (shimmerAnimator != null) shimmerAnimator.cancel();
        cancelFailure();
        pulseScale = 1f;
        pulseAnimator = ValueAnimator.ofFloat(1f, 0.91f, 1.04f, 0.96f, 1f);
        pulseAnimator.setDuration(320L);
        pulseAnimator.setInterpolator(new DecelerateInterpolator());
        pulseAnimator.addUpdateListener(animation -> {
            pulseScale = (float) animation.getAnimatedValue();
            invalidateSelf();
        });
        pulseAnimator.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                pulseAnimator = null;
                pulseScale = 1f;
                invalidateSelf();
            }
        });
        pulseAnimator.start();
    }

    public void startFailureFeedback() {
        if (shimmerAnimator != null) shimmerAnimator.cancel();
        if (pulseAnimator != null) pulseAnimator.cancel();
        if (failureAnimator != null) failureAnimator.cancel();
        pulseScale = 1f;
        jitterOffset = 0f;
        failureAnimator = ValueAnimator.ofFloat(0f, -2.2f, 2.2f, -1.6f, 1.6f, 0f);
        failureAnimator.setDuration(260L);
        failureAnimator.addUpdateListener(animation -> {
            jitterOffset = (float) animation.getAnimatedValue();
            invalidateSelf();
        });
        failureAnimator.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                failureAnimator = null;
                jitterOffset = 0f;
                invalidateSelf();
            }
        });
        failureAnimator.start();
    }

    private void cancelPulseAndFailure() {
        if (pulseAnimator != null) pulseAnimator.cancel();
        cancelFailure();
        pulseScale = 1f;
        jitterOffset = 0f;
    }

    private void cancelFailure() {
        if (failureAnimator != null) failureAnimator.cancel();
        jitterOffset = 0f;
    }

    @Override
    protected void onBoundsChange(Rect bounds) {
        super.onBoundsChange(bounds);
        if (alien != null) alien.setBounds(0, 0, (int) ICON_SIZE, (int) ICON_SIZE);
    }

    @Override
    public void setAlpha(int alpha) {
        backgroundPaint.setAlpha(alpha);
        savedHighlightPaint.setAlpha(alpha);
        shimmerPaint.setAlpha(alpha);
        alien.setAlpha(alpha);
        invalidateSelf();
    }

    @Override
    public void setColorFilter(android.graphics.ColorFilter colorFilter) {
        backgroundPaint.setColorFilter(colorFilter);
        shimmerPaint.setColorFilter(colorFilter);
        alien.setColorFilter(colorFilter);
        invalidateSelf();
    }

    @Override
    public int getOpacity() {
        return android.graphics.PixelFormat.TRANSLUCENT;
    }

    @Override
    public int getIntrinsicWidth() {
        return 48;
    }

    @Override
    public int getIntrinsicHeight() {
        return 48;
    }
}
