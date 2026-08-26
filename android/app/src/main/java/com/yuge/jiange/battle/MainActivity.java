package com.yuge.jiange.battle;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * 宇哥 VS 检哥 · 赛博回合制对战
 * 极简 WebView 封装：把本地 HTML5 游戏包成原生 APK。
 * 游戏本体全部在 assets/ 目录（index.html / style.css / script.js / 图片 / 音效）。
 */
public class MainActivity extends Activity {

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 全屏（隐藏标题栏）
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        // 保持屏幕常亮（打游戏时不会自动锁屏）
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // 沉浸式全屏：隐藏状态栏与导航栏，滑动边缘可临时唤出
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }

        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);                     // 游戏脚本依赖 JS
        s.setDomStorageEnabled(true);                     // localStorage / DOM 存储
        s.setAllowFileAccess(true);                       // Android 11+ 需显式允许 file://
        s.setAllowContentAccess(true);
        // 禁用缓存：每次启动都从 assets 加载最新文件，避免 WebView 缓存旧版页面/素材
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setMediaPlaybackRequiresUserGesture(false);     // 允许 JS 直接播放音频（游戏内点击已解锁）
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);

        webView.setWebViewClient(new WebViewClient() {
            // 拦截 mailto: 链接：自动调起系统邮件客户端（关于界面点击邮箱即可发邮件）
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && url.startsWith("mailto:")) {
                    try {
                        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse(url));
                        view.getContext().startActivity(i);
                    } catch (ActivityNotFoundException e) {
                        // 设备没有邮件客户端时忽略
                    }
                    return true;
                }
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request != null && request.getUrl() != null ? request.getUrl().toString() : null;
                if (url != null && url.startsWith("mailto:")) {
                    try {
                        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse(url));
                        view.getContext().startActivity(i);
                    } catch (ActivityNotFoundException e) {
                        // 设备没有邮件客户端时忽略
                    }
                    return true;
                }
                return false;
            }
        });
        webView.setWebChromeClient(new WebChromeClient());
        webView.setBackgroundColor(0xFF060913);           // 与游戏背景色一致，避免白闪
        webView.loadUrl("file:///android_asset/index.html");

        setContentView(webView);
    }

    // 重新聚焦时保持沉浸式全屏（用户唤出系统栏后自动收回）
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    // 返回键：游戏无页面跳转，直接退出
    @Override
    public void onBackPressed() {
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
