package com.cloudbrowser.app;

import android.app.Activity;
import android.graphics.Insets;
import android.os.Build;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.WindowInsets;
import android.view.WindowMetrics;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 原生屏幕信息插件：把刘海/圆角/曲面/折叠屏信息安全区传给 Web 层，
 * 让同一套 UI 在曲面屏、方形屏、刘海屏、折叠屏上都能正确布局。
 */
@CapacitorPlugin(name = "ScreenCompat")
public class ScreenCompatPlugin extends Plugin {

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject ret = new JSObject();
        Activity activity = getActivity();
        if (activity == null) { call.resolve(ret); return; }

        int top = 0, bottom = 0, left = 0, right = 0;
        int widthPx = 0, heightPx = 0;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowMetrics metrics = activity.getWindowManager().getCurrentWindowMetrics();
            WindowInsets insets = metrics.getWindowInsets();
            if (insets != null) {
                Insets bars = insets.getInsetsIgnoringVisibility(
                    WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                Insets cutout = insets.getInsets(WindowInsets.Type.displayCutout());
                top = Math.max(bars.top, cutout.top);
                bottom = Math.max(bars.bottom, cutout.bottom);
                left = Math.max(bars.left, cutout.left);
                right = Math.max(bars.right, cutout.right);
            }
            android.graphics.Rect bounds = metrics.getBounds();
            widthPx = bounds.width();
            heightPx = bounds.height();
        } else {
            DisplayMetrics dm = new DisplayMetrics();
            activity.getWindowManager().getDefaultDisplay().getRealMetrics(dm);
            widthPx = dm.widthPixels;
            heightPx = dm.heightPixels;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                Display display = activity.getWindowManager().getDefaultDisplay();
                WindowInsets insets = activity.getWindow().getDecorView().getRootWindowInsets();
                if (insets != null && insets.getDisplayCutout() != null) {
                    android.graphics.Rect c = insets.getDisplayCutout().getBoundingRectTop();
                    top = Math.max(top, c.height());
                }
            }
        }

        float density = activity.getResources().getDisplayMetrics().density;
        // 转为 dp（CSS 像素约等于 dp）
        ret.put("safeTop", Math.round(top / density));
        ret.put("safeBottom", Math.round(bottom / density));
        ret.put("safeLeft", Math.round(left / density));
        ret.put("safeRight", Math.round(right / density));

        float ratio = heightPx > 0 ? (float) widthPx / heightPx : 1f;
        boolean squareish = ratio > 0.85f && ratio < 1.18f;
        boolean curved = isCurvedDevice();
        boolean foldable = isFoldableDevice();

        ret.put("isSquareish", squareish);
        ret.put("isCurved", curved);
        ret.put("isFoldable", foldable);
        ret.put("widthDp", Math.round(widthPx / density));
        ret.put("heightDp", Math.round(heightPx / density));
        ret.put("dpr", density);
        call.resolve(ret);
    }

    // 曲面屏多见于部分旗舰机型，用厂商 + 型号关键字近似识别
    private boolean isCurvedDevice() {
        String model = Build.MODEL.toLowerCase();
        String brand = Build.BRAND.toLowerCase();
        return (brand.contains("samsung") && (model.contains("edge") || model.contains("s9") || model.contains("s10")
                    || model.contains("note") || model.matches(".*s[2-9][0-9].*")))
                || (brand.contains("huawei") && (model.contains("pro") || model.contains("mate")))
                || (brand.contains("xiaomi") && model.contains("pro"))
                || model.contains("曲面");
    }

    // 折叠屏：以常见折叠机型/型号命名近似识别
    private boolean isFoldableDevice() {
        String model = Build.MODEL.toLowerCase();
        String brand = Build.BRAND.toLowerCase();
        return model.contains("fold") || model.contains("flip")
                || (brand.contains("samsung") && model.matches(".*fold.*"))
                || model.contains("折叠");
    }
}
