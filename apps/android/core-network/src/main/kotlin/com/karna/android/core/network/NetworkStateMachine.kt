package com.karna.android.core.network

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class ConnectionMode {
    LAN,
    PEER,
    RELAY,
    DEGRADED,
    OFFLINE
}

enum class NetworkState {
    UNPAIRED,
    DISCOVERING,
    PAIRING,
    CONNECTING,
    CONNECTED_LAN,
    CONNECTED_PEER,
    CONNECTED_RELAY,
    DISCONNECTED,
    RECONNECTING,
    DEGRADED,
    ERROR
}

sealed class NetworkEvent {
    object StartDiscovery : NetworkEvent()
    object DiscoveryFailed : NetworkEvent()
    object DeviceFound : NetworkEvent()
    object StartPairing : NetworkEvent()
    object PairingSuccess : NetworkEvent()
    object PairingFailed : NetworkEvent()
    object Connect : NetworkEvent()
    object ConnectedLan : NetworkEvent()
    object ConnectedPeer : NetworkEvent()
    object ConnectedRelay : NetworkEvent()
    object LanConnectionLost : NetworkEvent()
    object PeerConnectionLost : NetworkEvent()
    object RelayConnectionLost : NetworkEvent()
    object SwitchToRelay : NetworkEvent()
    object SwitchToLan : NetworkEvent()
    object SwitchToPeer : NetworkEvent()
    object Degraded : NetworkEvent()
    object Recovered : NetworkEvent()
    object Disconnect : NetworkEvent()
    object ConnectionLost : NetworkEvent()
    object StartReconnect : NetworkEvent()
    object ReconnectFailed : NetworkEvent()
    data class Error(val message: String) : NetworkEvent()
    object Reset : NetworkEvent()
}

class NetworkStateMachine(initialState: NetworkState = NetworkState.UNPAIRED) {
    private val _state = MutableStateFlow(initialState)
    val state: StateFlow<NetworkState> = _state.asStateFlow()

    private val _connectionMode = MutableStateFlow(ConnectionMode.OFFLINE)
    val connectionMode: StateFlow<ConnectionMode> = _connectionMode.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    fun transition(event: NetworkEvent) {
        val currentState = _state.value
        val nextState = when (currentState) {
            NetworkState.UNPAIRED -> when (event) {
                is NetworkEvent.StartDiscovery -> NetworkState.DISCOVERING
                is NetworkEvent.StartPairing -> NetworkState.PAIRING
                else -> currentState
            }
            NetworkState.DISCOVERING -> when (event) {
                is NetworkEvent.DeviceFound -> NetworkState.PAIRING
                is NetworkEvent.DiscoveryFailed -> NetworkState.ERROR
                is NetworkEvent.Reset -> NetworkState.UNPAIRED
                else -> currentState
            }
            NetworkState.PAIRING -> when (event) {
                is NetworkEvent.PairingSuccess -> NetworkState.CONNECTING
                is NetworkEvent.PairingFailed -> NetworkState.ERROR
                is NetworkEvent.Reset -> NetworkState.UNPAIRED
                else -> currentState
            }
            NetworkState.CONNECTING -> when (event) {
                is NetworkEvent.ConnectedLan -> {
                    _connectionMode.value = ConnectionMode.LAN
                    NetworkState.CONNECTED_LAN
                }
                is NetworkEvent.ConnectedPeer -> {
                    _connectionMode.value = ConnectionMode.PEER
                    NetworkState.CONNECTED_PEER
                }
                is NetworkEvent.ConnectedRelay -> {
                    _connectionMode.value = ConnectionMode.RELAY
                    NetworkState.CONNECTED_RELAY
                }
                is NetworkEvent.Disconnect -> NetworkState.DISCONNECTED
                is NetworkEvent.Degraded -> NetworkState.DEGRADED
                is NetworkEvent.Error -> {
                    _errorMessage.value = event.message
                    NetworkState.ERROR
                }
                is NetworkEvent.Reset -> NetworkState.UNPAIRED
                else -> currentState
            }
            NetworkState.CONNECTED_LAN -> when (event) {
                is NetworkEvent.Disconnect -> NetworkState.DISCONNECTED
                is NetworkEvent.LanConnectionLost -> {
                    _connectionMode.value = ConnectionMode.DEGRADED
                    NetworkState.RECONNECTING
                }
                is NetworkEvent.SwitchToRelay -> {
                    _connectionMode.value = ConnectionMode.RELAY
                    NetworkState.CONNECTED_RELAY
                }
                is NetworkEvent.SwitchToPeer -> {
                    _connectionMode.value = ConnectionMode.PEER
                    NetworkState.CONNECTED_PEER
                }
                is NetworkEvent.ConnectionLost -> {
                    _connectionMode.value = ConnectionMode.DEGRADED
                    NetworkState.RECONNECTING
                }
                is NetworkEvent.Degraded -> {
                    _connectionMode.value = ConnectionMode.DEGRADED
                    NetworkState.DEGRADED
                }
                is NetworkEvent.Error -> {
                    _errorMessage.value = event.message
                    NetworkState.ERROR
                }
                is NetworkEvent.Reset -> NetworkState.UNPAIRED
                else -> currentState
            }
            NetworkState.CONNECTED_PEER -> when (event) {
                is NetworkEvent.Disconnect -> NetworkState.DISCONNECTED
                is NetworkEvent.PeerConnectionLost -> {
                    _connectionMode.value = ConnectionMode.DEGRADED
                    NetworkState.RECONNECTING
                }
                is NetworkEvent.SwitchToLan -> {
                    _connectionMode.value = ConnectionMode.LAN
                    NetworkState.CONNECTED_LAN
                }
                is NetworkEvent.SwitchToRelay -> {
                    _connectionMode.value = ConnectionMode.RELAY
                    NetworkState.CONNECTED_RELAY
                }
                is NetworkEvent.ConnectionLost -> {
                    _connectionMode.value = ConnectionMode.DEGRADED
                    NetworkState.RECONNECTING
                }
                is NetworkEvent.Degraded -> {
                    _connectionMode.value = ConnectionMode.DEGRADED
                    NetworkState.DEGRADED
                }
                is NetworkEvent.Error -> {
                    _errorMessage.value = event.message
                    NetworkState.ERROR
                }
                is NetworkEvent.Reset -> NetworkState.UNPAIRED
                else -> currentState
            }
            NetworkState.CONNECTED_RELAY -> when (event) {
                is NetworkEvent.Disconnect -> NetworkState.DISCONNECTED
                is NetworkEvent.RelayConnectionLost -> {
                    _connectionMode.value = ConnectionMode.DEGRADED
                    NetworkState.RECONNECTING
                }
                is NetworkEvent.SwitchToLan -> {
                    _connectionMode.value = ConnectionMode.LAN
                    NetworkState.CONNECTED_LAN
                }
                is NetworkEvent.SwitchToPeer -> {
                    _connectionMode.value = ConnectionMode.PEER
                    NetworkState.CONNECTED_PEER
                }
                is NetworkEvent.ConnectionLost -> {
                    _connectionMode.value = ConnectionMode.DEGRADED
                    NetworkState.RECONNECTING
                }
                is NetworkEvent.Degraded -> {
                    _connectionMode.value = ConnectionMode.DEGRADED
                    NetworkState.DEGRADED
                }
                is NetworkEvent.Error -> {
                    _errorMessage.value = event.message
                    NetworkState.ERROR
                }
                is NetworkEvent.Reset -> NetworkState.UNPAIRED
                else -> currentState
            }
            NetworkState.DISCONNECTED -> when (event) {
                is NetworkEvent.Connect -> NetworkState.CONNECTING
                is NetworkEvent.StartReconnect -> NetworkState.RECONNECTING
                is NetworkEvent.Reset -> NetworkState.UNPAIRED
                else -> currentState
            }
            NetworkState.RECONNECTING -> when (event) {
                is NetworkEvent.ConnectedLan -> {
                    _connectionMode.value = ConnectionMode.LAN
                    NetworkState.CONNECTED_LAN
                }
                is NetworkEvent.ConnectedPeer -> {
                    _connectionMode.value = ConnectionMode.PEER
                    NetworkState.CONNECTED_PEER
                }
                is NetworkEvent.ConnectedRelay -> {
                    _connectionMode.value = ConnectionMode.RELAY
                    NetworkState.CONNECTED_RELAY
                }
                is NetworkEvent.Recovered -> {
                    when (_connectionMode.value) {
                        ConnectionMode.LAN -> NetworkState.CONNECTED_LAN
                        ConnectionMode.PEER -> NetworkState.CONNECTED_PEER
                        ConnectionMode.RELAY -> NetworkState.CONNECTED_RELAY
                        else -> NetworkState.CONNECTED_RELAY
                    }
                }
                is NetworkEvent.ReconnectFailed -> NetworkState.ERROR
                is NetworkEvent.Disconnect -> NetworkState.DISCONNECTED
                is NetworkEvent.Reset -> NetworkState.UNPAIRED
                else -> currentState
            }
            NetworkState.DEGRADED -> when (event) {
                is NetworkEvent.Recovered -> {
                    when (_connectionMode.value) {
                        ConnectionMode.LAN -> NetworkState.CONNECTED_LAN
                        ConnectionMode.PEER -> NetworkState.CONNECTED_PEER
                        ConnectionMode.RELAY -> NetworkState.CONNECTED_RELAY
                        else -> NetworkState.CONNECTED_RELAY
                    }
                }
                is NetworkEvent.ConnectedLan -> {
                    _connectionMode.value = ConnectionMode.LAN
                    NetworkState.CONNECTED_LAN
                }
                is NetworkEvent.ConnectedRelay -> {
                    _connectionMode.value = ConnectionMode.RELAY
                    NetworkState.CONNECTED_RELAY
                }
                is NetworkEvent.Disconnect -> NetworkState.DISCONNECTED
                is NetworkEvent.ConnectionLost -> NetworkState.ERROR
                is NetworkEvent.Error -> {
                    _errorMessage.value = event.message
                    NetworkState.ERROR
                }
                is NetworkEvent.Reset -> NetworkState.UNPAIRED
                else -> currentState
            }
            NetworkState.ERROR -> when (event) {
                is NetworkEvent.Reset -> {
                    _errorMessage.value = null
                    _connectionMode.value = ConnectionMode.OFFLINE
                    NetworkState.UNPAIRED
                }
                is NetworkEvent.Connect -> NetworkState.CONNECTING
                is NetworkEvent.StartReconnect -> NetworkState.RECONNECTING
                else -> currentState
            }
        }

        if (nextState != currentState) {
            _state.value = nextState
        }
    }

    fun reset() {
        transition(NetworkEvent.Reset)
    }

    fun isConnected(): Boolean {
        return _state.value == NetworkState.CONNECTED_LAN ||
               _state.value == NetworkState.CONNECTED_PEER ||
               _state.value == NetworkState.CONNECTED_RELAY
    }

    fun getCurrentMode(): ConnectionMode = _connectionMode.value
}
