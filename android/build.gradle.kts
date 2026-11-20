plugins {
    id("com.android.application") version "8.10.1" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.0" apply false
    id("com.google.devtools.ksp") version "2.1.0-1.0.29" apply false
}

// Optional: keep build output outside a synced folder (OneDrive/Dropbox can lock files in build/).
// Use: gradlew bundleRelease -Popenwallet.buildRoot=C:\path\outside\sync
providers.gradleProperty("openwallet.buildRoot").orNull?.let { root ->
    allprojects { layout.buildDirectory.set(file("$root/${project.name}")) }
}
