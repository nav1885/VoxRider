# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ---- VoxRider native modules ----
# Keep custom React Native bridge modules so R8 doesn't rename/remove them.
# VoxTTSModule is looked up by name via the React Native bridge reflection.
-keep class com.voxrider.VoxTTSModule { *; }
-keep class com.voxrider.VoxTTSPackage { *; }
-keep class com.voxrider.RadarService { *; }
-keep class com.voxrider.MainActivity { *; }
-keep class com.voxrider.MainApplication { *; }

# Keep all React Native bridge module subclasses
-keep public class * extends com.facebook.react.bridge.ReactContextBaseJavaModule { *; }
-keep public class * extends com.facebook.react.ReactPackage { *; }

# React Native core — prevent stripping of JS bridge internals
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Kotlin coroutines / metadata
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keep class kotlin.** { *; }
-keep class kotlinx.** { *; }
