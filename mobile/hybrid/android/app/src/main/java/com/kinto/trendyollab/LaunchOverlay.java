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
 private final Handler handler=new Handler(Looper.getMainLooper());private final long started=SystemClock.elapsedRealtime();
 private boolean ready,failed,closed,minimum;private AnimatorSet breathing;
 private final Runnable deadline=()->fail("تأخر الاتصال. تحقق من الإنترنت وأعد المحاولة.");
 LaunchOverlay(FrameLayout parent,Runnable reload){
  host=parent;Context c=parent.getContext();cover=new FrameLayout(c);cover.setBackgroundColor(Color.rgb(10,47,35));cover.setClickable(true);cover.setFocusable(true);cover.setContentDescription("KINTO launch screen");
  stack=new LinearLayout(c);stack.setOrientation(LinearLayout.VERTICAL);stack.setGravity(Gravity.CENTER);cover.addView(stack,new FrameLayout.LayoutParams(-1,-1));
  logo=new ImageView(c);logo.setImageResource(c.getResources().getIdentifier("kinto_foreground","drawable",c.getPackageName()));logo.setContentDescription("KINTO launch logo");logo.setScaleType(ImageView.ScaleType.FIT_CENTER);int side=Math.round(220*c.getResources().getDisplayMetrics().density);stack.addView(logo,new LinearLayout.LayoutParams(side,side));
  message=new TextView(c);message.setText("KINTO");message.setTextColor(Color.rgb(239,209,133));message.setTextSize(20);message.setGravity(Gravity.CENTER);message.setPadding(24,10,24,10);stack.addView(message);
  retry=new Button(c);retry.setText("إعادة المحاولة");retry.setAllCaps(false);retry.setVisibility(View.GONE);retry.setOnClickListener(v->{failed=false;ready=false;retry.setVisibility(View.GONE);message.setText("جارٍ الاتصال بـ KINTO…");handler.removeCallbacks(deadline);handler.postDelayed(deadline,12000);reload.run();});stack.addView(retry);
  host.addView(cover,new FrameLayout.LayoutParams(-1,-1));
  if(ValueAnimator.areAnimatorsEnabled()){
   ObjectAnimator x=ObjectAnimator.ofFloat(logo,View.SCALE_X,1f,1.055f),y=ObjectAnimator.ofFloat(logo,View.SCALE_Y,1f,1.055f),a=ObjectAnimator.ofFloat(logo,View.ALPHA,.86f,1f);
   for(ObjectAnimator anim:new ObjectAnimator[]{x,y,a}){anim.setRepeatCount(1);anim.setRepeatMode(ValueAnimator.REVERSE);anim.setDuration(850);}
   breathing=new AnimatorSet();breathing.playTogether(x,y,a);breathing.start();
  }
  handler.postDelayed(()->{minimum=true;if(ready&&!failed)hide();else{stopMotion();message.setText(failed?"تعذر الاتصال بـ KINTO. تحقق من الإنترنت.":"جارٍ تجهيز KINTO…");}},2000);
  handler.postDelayed(deadline,12000);
 }
 void ready(){if(closed||failed)return;ready=true;if(minimum)hide();}
 void fail(String text){if(closed)return;failed=true;ready=false;stopMotion();message.setText(text);retry.setVisibility(View.VISIBLE);}
 private void stopMotion(){if(breathing!=null)breathing.cancel();logo.setScaleX(1);logo.setScaleY(1);logo.setAlpha(1);}
 private void hide(){if(closed)return;closed=true;handler.removeCallbacksAndMessages(null);stopMotion();cover.animate().alpha(0).setDuration(ValueAnimator.areAnimatorsEnabled()?180:0).withEndAction(()->host.removeView(cover)).start();}
 void dispose(){closed=true;handler.removeCallbacksAndMessages(null);stopMotion();cover.animate().cancel();host.removeView(cover);}
}
