package com.karna.android.ui.interactions

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.Executor
import javax.inject.Inject
import javax.inject.Singleton

enum class RiskLevel {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
}

@Singleton
class ApprovalHandler @Inject constructor(
    @ApplicationContext private val context: Context
) {
    fun isBiometricAvailable(): Boolean {
        val biometricManager = BiometricManager.from(context)
        return biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL) == BiometricManager.BIOMETRIC_SUCCESS
    }

    fun requiresBiometric(riskLevel: RiskLevel): Boolean {
        return riskLevel == RiskLevel.HIGH || riskLevel == RiskLevel.CRITICAL
    }

    fun requiresBiometric(actionType: String): Boolean {
        val highRiskKeywords = listOf("sudo", "rm -rf", "delete", "payment", "付款", "删除", "root", "format", "mkfs")
        return highRiskKeywords.any { actionType.contains(it, ignoreCase = true) }
    }

    fun showBiometricPrompt(
        activity: FragmentActivity,
        title: String,
        subtitle: String,
        description: String,
        onSuccess: () -> Unit,
        onError: (String) -> Unit,
        onCancel: () -> Unit = {}
    ) {
        val executor: Executor = ContextCompat.getMainExecutor(context)

        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                onSuccess()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                if (errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                    errorCode == BiometricPrompt.ERROR_USER_CANCELED) {
                    onCancel()
                } else {
                    onError(errString.toString())
                }
            }

            override fun onAuthenticationFailed() {
                super.onAuthenticationFailed()
            }
        }

        val biometricPrompt = BiometricPrompt(activity, executor, callback)

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setDescription(description)
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
            .build()

        biometricPrompt.authenticate(promptInfo)
    }

    fun getRiskLevel(approvalLevel: String): RiskLevel {
        return when (approvalLevel.lowercase()) {
            "auto", "notify" -> RiskLevel.LOW
            "confirm" -> RiskLevel.MEDIUM
            "approve" -> RiskLevel.HIGH
            "critical" -> RiskLevel.CRITICAL
            else -> RiskLevel.MEDIUM
        }
    }
}
