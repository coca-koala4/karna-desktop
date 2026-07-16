package com.karna.android.core.navigation

object NavRoutes {
    const val WELCOME = "welcome"
    const val PAIR_QR_SCAN = "pair/qr_scan"
    const val PAIR_SAS_CONFIRM = "pair/sas_confirm"
    const val PROJECTS = "projects"
    const val CONVERSATIONS = "conversations?projectId={projectId}"
    const val CONVERSATION_DETAIL = "conversation/{conversationId}"
    const val RUNS = "runs"
    const val RUN_DETAIL = "run/{runId}"
    const val FILES = "files"
    const val FILE_PREVIEW = "file/{fileId}"
    const val INTERACTIONS = "interactions"
    const val INTERACTION_DETAIL = "interaction/{interactionId}"
    const val DEVICES = "devices"
    const val DEVICE_PAIRING = "device/pairing"
    const val DEVICE_DETAIL = "device/{deviceId}"
    const val SETTINGS = "settings"
    const val PLAN = "mode/plan"
    const val GOAL = "mode/goal"
    const val LIVING_WORK = "mode/living_work"

    fun conversations(projectId: String? = null): String {
        return if (projectId != null) "conversations?projectId=$projectId" else "conversations"
    }

    fun conversationDetail(conversationId: String) = "conversation/$conversationId"
    fun projectDetail(projectId: String) = "project/$projectId"
    fun runDetail(runId: String) = "run/$runId"
    fun filePreview(fileId: String) = "file/$fileId"
    fun interactionDetail(interactionId: String) = "interaction/$interactionId"
    fun deviceDetail(deviceId: String) = "device/$deviceId"
    fun sasConfirm() = "pair/sas_confirm"
    fun plan() = PLAN
    fun goal() = GOAL
    fun livingWork() = LIVING_WORK
}
