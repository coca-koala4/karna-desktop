package com.karna.android.core.network

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.coroutines.coroutineContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap

data class DiscoveredDevice(
    val host: String,
    val port: Int,
    val deviceName: String? = null,
    val version: String? = null,
    val capabilities: List<String> = emptyList()
)

class LanDiscovery(
    private val client: OkHttpClient,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
) {
    private val _discoveredDevices = MutableStateFlow<List<DiscoveredDevice>>(emptyList())
    val discoveredDevices: StateFlow<List<DiscoveredDevice>> = _discoveredDevices.asStateFlow()

    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning.asStateFlow()

    private var scanJob: Job? = null
    private val scannedHosts = Collections.newSetFromMap(ConcurrentHashMap<String, Boolean>())

    private val karnaPortRange = (8123..8130)

    fun startScanning() {
        if (scanJob?.isActive == true) return

        scannedHosts.clear()
        _isScanning.value = true
        _discoveredDevices.value = emptyList()

        scanJob = scope.launch {
            val localSubnets = getLocalSubnets()
            localSubnets.forEach { subnet ->
                scanSubnet(subnet)
            }
            _isScanning.value = false
        }
    }

    fun stopScanning() {
        scanJob?.cancel()
        scanJob = null
        _isScanning.value = false
    }

    private suspend fun scanSubnet(subnet: String) {
        val base = subnet.substringBeforeLast(".")
        for (i in 1..254) {
            if (!coroutineContext.isActive) break
            val host = "$base.$i"
            if (scannedHosts.add(host)) {
                scanHost(host)
            }
        }
    }

    private suspend fun scanHost(host: String) {
        for (port in karnaPortRange) {
            if (!coroutineContext.isActive) break
            try {
                val reachable = checkPortReachable(host, port, 500)
                if (reachable) {
                    probeDevice(host, port)
                }
            } catch (_: Exception) {
            }
        }
    }

    private fun checkPortReachable(host: String, port: Int, timeoutMs: Int): Boolean {
        return try {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(host, port), timeoutMs)
                true
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun probeDevice(host: String, port: Int) {
        scope.launch {
            try {
                val url = "https://$host:$port/api/capabilities"
                val request = Request.Builder()
                    .url(url)
                    .get()
                    .build()

                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful) {
                        val device = DiscoveredDevice(
                            host = host,
                            port = port,
                            deviceName = "Karna Desktop @ $host",
                            version = null
                        )
                        addDevice(device)
                    }
                }
            } catch (_: Exception) {
            }
        }
    }

    private fun addDevice(device: DiscoveredDevice) {
        val current = _discoveredDevices.value.toMutableList()
        if (current.none { it.host == device.host && it.port == device.port }) {
            current.add(device)
            _discoveredDevices.value = current
        }
    }

    private fun getLocalSubnets(): List<String> {
        val subnets = mutableListOf<String>()
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            for (networkInterface in Collections.list(interfaces)) {
                if (!networkInterface.isUp || networkInterface.isLoopback) continue
                val addresses = Collections.list(networkInterface.inetAddresses)
                for (address in addresses) {
                    if (address.isLoopbackAddress) continue
                    val hostAddress = address.hostAddress ?: continue
                    if (hostAddress.contains(':')) continue
                    if (isPrivateAddress(hostAddress)) {
                        subnets.add(hostAddress)
                    }
                }
            }
        } catch (_: Exception) {
        }
        return subnets
    }

    private fun isPrivateAddress(host: String): Boolean {
        return host.startsWith("192.168.") ||
                host.startsWith("10.") ||
                host.startsWith("172.")
    }
}
