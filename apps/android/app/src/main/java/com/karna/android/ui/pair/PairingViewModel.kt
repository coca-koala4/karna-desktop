package com.karna.android.ui.pair

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karna.android.data.repository.DevicePairingRepository
import com.karna.android.data.repository.DevicePairingStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class PairingStep {
    WELCOME,
    QR_SCAN,
    SAS_CONFIRM,
    COMPLETED,
    ERROR
}

data class PairingUiState(
    val step: PairingStep = PairingStep.WELCOME,
    val isScanning: Boolean = false,
    val sasCode: String = "",
    val deviceName: String = "",
    val deviceId: String = "",
    val errorMessage: String? = null,
    val isProcessing: Boolean = false
)

@HiltViewModel
class PairingViewModel @Inject constructor(
    private val devicePairingRepository: DevicePairingRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(PairingUiState())
    val uiState: StateFlow<PairingUiState> = _uiState.asStateFlow()

    init {
        observePairingState()
    }

    private fun observePairingState() {
        viewModelScope.launch {
            devicePairingRepository.pairingStatus.collect { status ->
                when (status) {
                    is DevicePairingStatus.Idle -> {
                        _uiState.value = PairingUiState(step = PairingStep.WELCOME)
                    }
                    is DevicePairingStatus.Scanning -> {
                        _uiState.value = PairingUiState(
                            step = PairingStep.QR_SCAN,
                            isScanning = true
                        )
                    }
                    is DevicePairingStatus.Processing -> {
                        _uiState.value = _uiState.value.copy(
                            isScanning = false,
                            isProcessing = true,
                            errorMessage = null
                        )
                    }
                    is DevicePairingStatus.SasReady -> {
                        _uiState.value = PairingUiState(
                            step = PairingStep.SAS_CONFIRM,
                            isScanning = false,
                            isProcessing = false,
                            sasCode = status.sasCode,
                            deviceName = status.deviceName,
                            deviceId = status.deviceId
                        )
                    }
                    is DevicePairingStatus.Completed -> {
                        _uiState.value = PairingUiState(
                            step = PairingStep.COMPLETED,
                            isProcessing = false,
                            deviceName = status.deviceName,
                            deviceId = status.deviceId
                        )
                    }
                    is DevicePairingStatus.Error -> {
                        _uiState.value = _uiState.value.copy(
                            step = if (_uiState.value.step == PairingStep.WELCOME) PairingStep.WELCOME else PairingStep.ERROR,
                            isScanning = false,
                            isProcessing = false,
                            errorMessage = status.message
                        )
                    }
                }
            }
        }
    }

    fun startPairing() {
        devicePairingRepository.startScanning()
    }

    fun onQrCodeScanned(qrContent: String) {
        viewModelScope.launch {
            devicePairingRepository.processQrContent(qrContent)
        }
    }

    fun confirmSasCode() {
        viewModelScope.launch {
            devicePairingRepository.confirmSasCode(confirmed = true)
        }
    }

    fun rejectSasCode() {
        viewModelScope.launch {
            devicePairingRepository.confirmSasCode(confirmed = false)
        }
    }

    fun goBack() {
        devicePairingRepository.cancelPairing()
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
        devicePairingRepository.cancelPairing()
    }
}
