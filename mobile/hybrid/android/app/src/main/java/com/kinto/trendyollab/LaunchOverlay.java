package com.kinto.trendyollab;
import android.animation.*;
import android.content.Context;
import android.graphics.Color;
import android.os.*;
import android.view.*;
import android.widget.*;
/** Cosmetic first-launch cover only; account navigation and WebView load run underneath. */
final class LaunchOverlay {
 private final FrameLayout host,cover; private final LinearLayout stack;private final TextView message;private final Button retry;private final ImageView logo;
 private final Handler handler=new Handler(Looper.getMainLooper());
 private boolean ready,failed,closed,minimum,started;private ValueAnimator breathing,reveal;
 private final Runnable deadline=()->fail("تأخر الاتصال. تحقق من الإنترنت وأعد المحاولة.");
 LaunchOverlay(FrameLayout parent,Runnable reload){
  host=parent;Context c=parent.getContext();cover=new FrameLayout(c);cover.setBackgroundColor(Color.rgb(10,47,35));cover.setClickable(true);cover.setFocusable(true);cover.setContentDescription("KINTO launch screen");
  stack=new LinearLayout(c);stack.setOrientation(LinearLayout.VERTICAL);stack.setGravity(Gravity.CENTER);cover.addView(stack,new FrameLayout.LayoutParams(-1,-1));
  logo=new ImageView(c);logo.setImageResource(c.getResources().getIdentifier("kinto_foreground","drawable",c.getPackageName()));logo.setContentDescription("KINTO launch logo");logo.setScaleType(ImageView.ScaleType.FIT_CENTER);int side=Math.round(208*c.getResources().getDisplayMetrics().density);stack.addView(logo,new LinearLayout.LayoutParams(side,side));
  message=new TextView(c);message.setText("KINTO");message.setTextColor(Color.rgb(239,209,133));message.setTextSize(20);message.setGravity(Gravity.CENTER);message.setPadding(24,10,24,10);stack.addView(message);
  retry=new Button(c);retry.setText("إعادة المحاولة");retry.setAllCaps(false);retry.setVisibility(View.GONE);retry.setOnClickListener(v->{failed=false;ready=false;retry.setVisibility(View.GONE);message.setText("KINTO");handler.removeCallbacks(deadline);handler.postDelayed(deadline,12000);reload.run();});stack.addView(retry);
  host.addView(cover,new FrameLayout.LayoutParams(-1,-1));
  if(Build.VERSION.SDK_INT<31)cover.getViewTreeObserver().addOnDrawListener(new android.view.ViewTreeObserver.OnDrawListener(){boolean drawn;public void onDraw(){if(drawn)return;drawn=true;cover.post(()->{if(cover.getViewTreeObserver().isAlive())cover.getViewTreeObserver().removeOnDrawListener(this);start();});}});
  handler.postDelayed(()->{if(!started&&!closed){start();fail("تأخر تجهيز الشاشة. أعد المحاولة.");}},12000);
 }
 void start(){
  if(started||closed)return;started=true;
  if(PreviewMode.enabled(host.getContext()))android.util.Log.i("KintoLaunch","NATIVE_COVER_STARTED");
  if(ValueAnimator.areAnimatorsEnabled()){
   // One continuous cosine cycle: zero velocity at both ends and at the peak.
   breathing=ValueAnimator.ofFloat(0f,1f);breathing.setDuration(2000);
   breathing.setInterpolator(new android.view.animation.LinearInterpolator());
   breathing.addUpdateListener(anim->{float t=(Float)anim.getAnimatedValue();float wave=(float)(.5-.5*Math.cos(2*Math.PI*t));float scale=1f+.035f*wave;logo.setScaleX(scale);logo.setScaleY(scale);});
   breathing.start();
  }
  handler.postDelayed(()->{minimum=true;if(ready&&!failed)hide();else{stopMotion();if(!failed)message.setText("KINTO");}},2000);
  handler.postDelayed(deadline,12000);
 }
 void ready(){if(closed||failed)return;ready=true;if(minimum)hide();}
 void fail(String text){if(closed)return;failed=true;ready=false;stopMotion();message.setText(text);retry.setVisibility(View.VISIBLE);}
 private void stopMotion(){if(breathing!=null)breathing.cancel();logo.setScaleX(1);logo.setScaleY(1);logo.setAlpha(1f);}
 private void hide(){
  if(closed)return;closed=true;handler.removeCallbacksAndMessages(null);
  // Cancel without resetting the current transform: no snap between breathing and reveal.
  if(breathing!=null)breathing.cancel();
  boolean motion=ValueAnimator.areAnimatorsEnabled();long duration=motion?560:0;
  if(PreviewMode.enabled(host.getContext()))android.util.Log.i("KintoLaunch","ZOOM_REVEAL_STARTED");
  android.view.animation.PathInterpolator easing=new android.view.animation.PathInterpolator(.4f,0f,.2f,1f);
  // A single clock keeps zoom, text and background in sync even on a busy UI thread.
  reveal=ValueAnimator.ofFloat(0f,1f);reveal.setDuration(duration);reveal.setInterpolator(new android.view.animation.LinearInterpolator());
  reveal.addUpdateListener(anim->{float t=(Float)anim.getAnimatedValue();float scale=1f+(motion?1.65f:0f)*easing.getInterpolation(t);logo.setScaleX(scale);logo.setScaleY(scale);logo.setAlpha(1f);message.setAlpha(1-t);cover.setAlpha(1-t*t*t);});
  reveal.addListener(new AnimatorListenerAdapter(){@Override public void onAnimationEnd(Animator animation){host.removeView(cover);if(host.getChildCount()>0)host.getChildAt(0).requestFocus(View.FOCUS_FORWARD);}});
  reveal.start();
 }

 void dispose(){closed=true;handler.removeCallbacksAndMessages(null);stopMotion();if(reveal!=null){reveal.removeAllListeners();reveal.cancel();}host.removeView(cover);}
}
