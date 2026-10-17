package com.ainsta.collector;

import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;

public final class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        TextView placeholder = new TextView(this);
        placeholder.setText("AInsta");
        placeholder.setTextSize(30);
        placeholder.setTextColor(0xFF000000);
        setContentView(placeholder);
    }
}
