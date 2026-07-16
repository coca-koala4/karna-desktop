package com.karna.android.core.network

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.internal.EMPTY_REQUEST
import okio.IOException

class RemoteApiService(
    private val client: OkHttpClient,
    private var baseUrl: String = "",
    private var sessionToken: String? = null
) {
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    fun setBaseUrl(url: String) {
        baseUrl = url.trimEnd('/')
    }

    fun setSessionToken(token: String?) {
        sessionToken = token
    }

    private fun Request.Builder.addAuthHeader(): Request.Builder {
        sessionToken?.let {
            addHeader("Authorization", "Bearer $it")
        }
        return this
    }

    suspend fun getCapabilities(): Result<String> = executeGet("/remote/v1/capabilities")

    suspend fun pairingHello(payload: String): Result<String> =
        executePost("/remote/v1/pairing/hello", payload.toRequestBody(jsonMediaType))

    suspend fun pairingConfirm(payload: String): Result<String> =
        executePost("/remote/v1/pairing/confirm", payload.toRequestBody(jsonMediaType))

    suspend fun pairingFinalize(payload: String): Result<String> =
        executePost("/remote/v1/pairing/finalize", payload.toRequestBody(jsonMediaType))

    suspend fun openSession(payload: String): Result<String> =
        executePost("/remote/v1/sessions", payload.toRequestBody(jsonMediaType))

    suspend fun refreshSession(): Result<String> =
        executePost("/remote/v1/sessions/refresh", EMPTY_REQUEST)

    suspend fun closeSession(): Result<String> =
        executePost("/remote/v1/sessions/close", EMPTY_REQUEST)

    suspend fun getProjects(): Result<String> = executeGet("/remote/v1/projects")

    suspend fun getProject(projectId: String): Result<String> =
        executeGet("/remote/v1/projects/$projectId")

    suspend fun getProjectStatus(projectId: String): Result<String> =
        executeGet("/remote/v1/projects/$projectId/status")

    suspend fun getConversations(projectId: String? = null): Result<String> {
        val path = if (projectId != null) {
            "/remote/v1/projects/$projectId/conversations"
        } else {
            "/remote/v1/conversations"
        }
        return executeGet(path)
    }

    suspend fun getConversation(conversationId: String): Result<String> =
        executeGet("/remote/v1/conversations/$conversationId")

    suspend fun createConversation(payload: String): Result<String> =
        executePost("/remote/v1/conversations", payload.toRequestBody(jsonMediaType))

    suspend fun getMessages(conversationId: String, cursor: String? = null, limit: Int = 50): Result<String> {
        val path = buildString {
            append("/remote/v1/conversations/$conversationId/messages")
            append("?limit=$limit")
            cursor?.let { append("&cursor=$it") }
        }
        return executeGet(path)
    }

    suspend fun sendCommand(payload: String): Result<String> =
        executePost("/remote/v1/commands", payload.toRequestBody(jsonMediaType))

    suspend fun getRuns(conversationId: String): Result<String> =
        executeGet("/remote/v1/conversations/$conversationId/runs")

    suspend fun getRun(runId: String): Result<String> =
        executeGet("/remote/v1/runs/$runId")

    suspend fun getAllRuns(): Result<String> = executeGet("/remote/v1/runs")

    suspend fun startRun(conversationId: String, payload: String): Result<String> =
        executePost("/remote/v1/conversations/$conversationId/runs", payload.toRequestBody(jsonMediaType))

    suspend fun cancelRun(conversationId: String, runId: String): Result<String> =
        executePost("/remote/v1/conversations/$conversationId/runs/$runId/cancel", EMPTY_REQUEST)

    suspend fun pauseRun(conversationId: String, runId: String): Result<String> =
        executePost("/remote/v1/conversations/$conversationId/runs/$runId/pause", EMPTY_REQUEST)

    suspend fun resumeRun(conversationId: String, runId: String): Result<String> =
        executePost("/remote/v1/conversations/$conversationId/runs/$runId/resume", EMPTY_REQUEST)

    suspend fun retryRun(conversationId: String, runId: String): Result<String> =
        executePost("/remote/v1/conversations/$conversationId/runs/$runId/retry", EMPTY_REQUEST)

    suspend fun getPendingInteractions(): Result<String> =
        executeGet("/remote/v1/interactions/pending")

    suspend fun getInteraction(interactionId: String): Result<String> =
        executeGet("/remote/v1/interactions/$interactionId")

    suspend fun getInteractions(runId: String): Result<String> =
        executeGet("/remote/v1/runs/$runId/interactions")

    suspend fun respondInteraction(interactionId: String, payload: String): Result<String> =
        executePost("/remote/v1/interactions/$interactionId/respond", payload.toRequestBody(jsonMediaType))

    suspend fun sendInteraction(runId: String, payload: String): Result<String> =
        executePost("/remote/v1/runs/$runId/interactions", payload.toRequestBody(jsonMediaType))

    suspend fun getFiles(projectId: String? = null): Result<String> {
        val path = if (projectId != null) {
            "/remote/v1/projects/$projectId/files"
        } else {
            "/remote/v1/files"
        }
        return executeGet(path)
    }

    suspend fun getFileInfo(fileId: String): Result<String> =
        executeGet("/remote/v1/files/$fileId")

    suspend fun getFile(fileId: String): Result<String> =
        executeGet("/remote/v1/files/$fileId")

    suspend fun uploadFile(payload: RequestBody): Result<String> =
        executePost("/remote/v1/files", payload)

    suspend fun createPreview(fileId: String, payload: String): Result<String> =
        executePost("/remote/v1/files/$fileId/preview", payload.toRequestBody(jsonMediaType))

    suspend fun getPreviewManifest(previewId: String): Result<String> =
        executeGet("/remote/v1/previews/$previewId/manifest")

    suspend fun getPreviewChunk(previewId: String, chunkIndex: Int): Result<String> =
        executeGet("/remote/v1/previews/$previewId/chunks/$chunkIndex")

    suspend fun getSyncSnapshot(cursor: Long? = null): Result<String> {
        val path = buildString {
            append("/remote/v1/sync/snapshot")
            cursor?.let { append("?cursor=$it") }
        }
        return executeGet(path)
    }

    suspend fun getCurrentMode(): Result<String> =
        executeGet("/remote/v1/mode/current")

    suspend fun getCurrentPlan(projectId: String? = null): Result<String> {
        val path = if (projectId != null) {
            "/remote/v1/projects/$projectId/plan"
        } else {
            "/remote/v1/mode/plan"
        }
        return executeGet(path)
    }

    suspend fun getPlan(planId: String): Result<String> =
        executeGet("/remote/v1/plans/$planId")

    suspend fun approvePlan(planId: String): Result<String> =
        executePost("/remote/v1/plans/$planId/approve", EMPTY_REQUEST)

    suspend fun rejectPlan(planId: String, payload: String): Result<String> =
        executePost("/remote/v1/plans/$planId/reject", payload.toRequestBody(jsonMediaType))

    suspend fun pausePlan(planId: String): Result<String> =
        executePost("/remote/v1/plans/$planId/pause", EMPTY_REQUEST)

    suspend fun resumePlan(planId: String): Result<String> =
        executePost("/remote/v1/plans/$planId/resume", EMPTY_REQUEST)

    suspend fun getCurrentGoal(projectId: String? = null): Result<String> {
        val path = if (projectId != null) {
            "/remote/v1/projects/$projectId/goal"
        } else {
            "/remote/v1/mode/goal"
        }
        return executeGet(path)
    }

    suspend fun getGoal(goalId: String): Result<String> =
        executeGet("/remote/v1/goals/$goalId")

    suspend fun confirmGoal(goalId: String): Result<String> =
        executePost("/remote/v1/goals/$goalId/confirm", EMPTY_REQUEST)

    suspend fun updateGoalBudget(goalId: String, payload: String): Result<String> =
        executePost("/remote/v1/goals/$goalId/budget", payload.toRequestBody(jsonMediaType))

    suspend fun resolveBlocker(goalId: String, blockerId: String): Result<String> =
        executePost("/remote/v1/goals/$goalId/blockers/$blockerId/resolve", EMPTY_REQUEST)

    suspend fun getCurrentLivingWork(projectId: String? = null): Result<String> {
        val path = if (projectId != null) {
            "/remote/v1/projects/$projectId/living-work"
        } else {
            "/remote/v1/mode/living-work"
        }
        return executeGet(path)
    }

    suspend fun getLivingWork(workId: String): Result<String> =
        executeGet("/remote/v1/living-works/$workId")

    suspend fun selectCandidateStep(workId: String, stepId: String): Result<String> =
        executePost("/remote/v1/living-works/$workId/steps/$stepId/select", EMPTY_REQUEST)

    suspend fun approveCandidateStep(workId: String, stepId: String): Result<String> =
        executePost("/remote/v1/living-works/$workId/steps/$stepId/approve", EMPTY_REQUEST)

    suspend fun rejectCandidateStep(workId: String, stepId: String, payload: String): Result<String> =
        executePost("/remote/v1/living-works/$workId/steps/$stepId/reject", payload.toRequestBody(jsonMediaType))

    suspend fun deferCandidateStep(workId: String, stepId: String): Result<String> =
        executePost("/remote/v1/living-works/$workId/steps/$stepId/defer", EMPTY_REQUEST)

    suspend fun modifyCandidateStep(workId: String, stepId: String, payload: String): Result<String> =
        executePost("/remote/v1/living-works/$workId/steps/$stepId/modify", payload.toRequestBody(jsonMediaType))

    private suspend fun executeGet(path: String): Result<String> {
        return runCatching {
            val request = Request.Builder()
                .url("$baseUrl$path")
                .addAuthHeader()
                .get()
                .build()
            executeRequest(request)
        }
    }

    private suspend fun executePost(path: String, body: RequestBody): Result<String> {
        return runCatching {
            val request = Request.Builder()
                .url("$baseUrl$path")
                .addAuthHeader()
                .post(body)
                .build()
            executeRequest(request)
        }
    }

    private fun executeRequest(request: Request): String {
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("HTTP ${response.code}: ${response.message}")
            }
            return response.body?.string() ?: throw IOException("Empty response body")
        }
    }
}
