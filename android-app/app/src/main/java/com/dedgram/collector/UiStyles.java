package com.dedgram.collector;

import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

public final class UiStyles {
    private UiStyles() {}

    public static TextView text(Context context, String value, float size, int color, boolean bold) {
        TextView view = new TextView(context);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL);
        return view;
    }

    public static TextView utility(Context context, String value) {
        TextView view = text(context, value.toUpperCase(), 10, 0xFF000000, true);
        view.setLetterSpacing(0.12f);
        return view;
    }

    public static Button button(Context context, String label, View.OnClickListener listener, boolean primary) {
        Button button = new Button(context);
        button.setAllCaps(false);
        button.setText(label.toUpperCase());
        button.setTextSize(11);
        button.setLetterSpacing(0.08f);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setTextColor(primary ? 0xFFFFFFFF : 0xFF000000);
        button.setGravity(Gravity.CENTER);
        button.setMinHeight(dp(context, 48));
        button.setMinimumHeight(dp(context, 48));
        button.setPadding(dp(context, 14), 0, dp(context, 14), 0);
        button.setBackground(outline(context, primary ? 0xFF000000 : 0xFFFFFFFF, 0xFF000000));
        button.setOnClickListener(listener);
        return button;
    }

    public static View rule(Context context, int color, int height) {
        View view = new View(context);
        view.setBackgroundColor(color);
        view.setLayoutParams(new android.widget.LinearLayout.LayoutParams(-1, dp(context, height)));
        return view;
    }

    public static GradientDrawable outline(Context context, int fill, int stroke) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setStroke(dp(context, 1), stroke);
        drawable.setCornerRadius(0);
        return drawable;
    }

    public static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
