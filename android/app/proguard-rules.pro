# Open Wallet release rules. Room, Compose and ZXing ship their own consumer rules.
# Keep line numbers so crash reports from Play Console can be read (with the mapping file).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# SQLCipher uses JNI callbacks into these classes.
-keep class net.zetetic.database.** { *; }
-keep,includedescriptorclasses class net.zetetic.** { *; }

