pluginManagement {
    repositories {
        maven { url = uri("https://maven.aliyun.com/repository/google") ; content { includeGroupByRegex("com\\.android.*") ; includeGroupByRegex("com\\.google.*") ; includeGroupByRegex("androidx.*") } }
        maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }
        maven { url = uri("https://maven.aliyun.com/repository/public") }
        maven { url = uri("https://maven.aliyun.com/repository/central") }
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://maven.aliyun.com/repository/public") }
        maven { url = uri("https://maven.aliyun.com/repository/central") }
        google()
        mavenCentral()
    }
}

rootProject.name = "karna-android"

include(":app")
include(":core-model")
include(":core-protocol")
include(":core-network")
include(":core-crypto")
include(":core-database")
include(":core-design-system")
include(":core-navigation")
include(":core-sync")
include(":core-preview")
