#include "CQuickJS.h"
#include "quickjs/quickjs.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

struct SaySoQuickJSContext {
    JSRuntime *runtime;
    JSContext *context;
    char *program;
    char *params_json;
    char *registered_application_json;
    JSValue registered_application;
    unsigned long id_counter;
};

static char *sayso_qjs_strdup(const char *input) {
    if (input == 0) {
        return 0;
    }
    size_t length = strlen(input);
    char *copy = (char *)malloc(length + 1);
    if (copy == 0) {
        return 0;
    }
    memcpy(copy, input, length + 1);
    return copy;
}

static void sayso_qjs_write_error(char *buffer, int length, const char *message) {
    if (buffer == 0 || length <= 0) {
        return;
    }
    int index = 0;
    while (message[index] != 0 && index < length - 1) {
        buffer[index] = message[index];
        index += 1;
    }
    buffer[index] = 0;
}

static void sayso_qjs_write_exception(JSContext *ctx, char *buffer, int length) {
    JSValue exception = JS_GetException(ctx);
    const char *message = JS_ToCString(ctx, exception);
    if (message != 0) {
        sayso_qjs_write_error(buffer, length, message);
        JS_FreeCString(ctx, message);
    } else {
        sayso_qjs_write_error(buffer, length, "QuickJS exception.");
    }
    JS_FreeValue(ctx, exception);
}

static JSValue sayso_qjs_json_parse(JSContext *ctx, const char *json) {
    const char *payload = json != 0 ? json : "{}";
    return JS_ParseJSON(ctx, payload, strlen(payload), "sayso-host-json");
}

static JSValue sayso_qjs_json_stringify(JSContext *ctx, JSValueConst value) {
    return JS_JSONStringify(ctx, value, JS_UNDEFINED, JS_UNDEFINED);
}

static JSValue sayso_qjs_object_with_status(JSContext *ctx, const char *status) {
    JSValue object = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, object, "status", JS_NewString(ctx, status));
    return object;
}

static JSValue sayso_qjs_now_iso(JSContext *ctx) {
    time_t raw_time = time(0);
    struct tm utc_time;
    gmtime_r(&raw_time, &utc_time);
    char buffer[32];
    strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &utc_time);
    return JS_NewString(ctx, buffer);
}

static JSValue sayso_qjs_generated_id(JSContext *ctx, SaySoQuickJSContext *host) {
    host->id_counter += 1;
    char buffer[64];
    snprintf(buffer, sizeof(buffer), "native-%llu-%lu", (unsigned long long)time(0), host->id_counter);
    return JS_NewString(ctx, buffer);
}

static JSValue sayso_qjs_register_application(JSContext *ctx, JSValueConst this_value, int argc, JSValueConst *argv) {
    (void)this_value;
    SaySoQuickJSContext *host = (SaySoQuickJSContext *)JS_GetContextOpaque(ctx);
    if (host == 0 || argc < 1) {
        return JS_ThrowTypeError(ctx, "sayso.registerApplication requires an application object.");
    }

    JSValue json_value = JS_JSONStringify(ctx, argv[0], JS_UNDEFINED, JS_UNDEFINED);
    if (JS_IsException(json_value)) {
        return json_value;
    }
    const char *json = JS_ToCString(ctx, json_value);
    if (json == 0) {
        JS_FreeValue(ctx, json_value);
        return JS_ThrowTypeError(ctx, "Unable to serialize registered application.");
    }

    char *copy = sayso_qjs_strdup(json);
    JS_FreeCString(ctx, json);
    JS_FreeValue(ctx, json_value);
    if (copy == 0) {
        return JS_ThrowOutOfMemory(ctx);
    }

    free(host->registered_application_json);
    host->registered_application_json = copy;
    JS_FreeValue(ctx, host->registered_application);
    host->registered_application = JS_DupValue(ctx, argv[0]);
    return JS_UNDEFINED;
}

static JSValue sayso_qjs_call(JSContext *ctx, JSValueConst this_value, int argc, JSValueConst *argv) {
    (void)this_value;
    SaySoQuickJSContext *host = (SaySoQuickJSContext *)JS_GetContextOpaque(ctx);
    if (host == 0 || argc < 1) {
        return JS_ThrowTypeError(ctx, "sayso.call requires an operation.");
    }
    const char *operation = argc > 0 ? JS_ToCString(ctx, argv[0]) : 0;
    if (operation == 0) {
        return JS_ThrowTypeError(ctx, "sayso.call operation must be a string.");
    }

    JSValue output = JS_UNDEFINED;
    if (strcmp(operation, "params.get") == 0) {
        output = sayso_qjs_json_parse(ctx, host->params_json);
    } else if (strcmp(operation, "clock.nowIso") == 0) {
        output = sayso_qjs_now_iso(ctx);
    } else if (strcmp(operation, "id.generate") == 0) {
        output = sayso_qjs_generated_id(ctx, host);
    } else if (strcmp(operation, "local.text.write") == 0) {
        output = sayso_qjs_object_with_status(ctx, "ok");
    } else if (strcmp(operation, "network.https.request") == 0) {
        JS_FreeCString(ctx, operation);
        return JS_ThrowTypeError(ctx, "network.https.request is not configured.");
    } else {
        JS_FreeCString(ctx, operation);
        return JS_ThrowTypeError(ctx, "Unsupported SaySo host operation.");
    }
    JS_FreeCString(ctx, operation);
    return output;
}

static int sayso_qjs_execute_pending_jobs(SaySoQuickJSContext *host, char *error_buffer, int error_buffer_length) {
    JSContext *job_context = 0;
    int guard = 0;
    while (JS_IsJobPending(host->runtime) && guard < 1024) {
        int result = JS_ExecutePendingJob(host->runtime, &job_context);
        if (result < 0) {
            sayso_qjs_write_exception(job_context != 0 ? job_context : host->context, error_buffer, error_buffer_length);
            return 0;
        }
        guard += 1;
    }
    if (guard >= 1024) {
        sayso_qjs_write_error(error_buffer, error_buffer_length, "QuickJS job queue did not drain.");
        return 0;
    }
    return 1;
}

static int sayso_qjs_install_sayso_global(SaySoQuickJSContext *host) {
    JSContext *ctx = host->context;
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue sayso = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, sayso, "registerApplication", JS_NewCFunction(ctx, sayso_qjs_register_application, "registerApplication", 1));
    JS_SetPropertyStr(ctx, sayso, "call", JS_NewCFunction(ctx, sayso_qjs_call, "call", 2));
    JS_SetPropertyStr(ctx, global, "sayso", sayso);
    JS_FreeValue(ctx, global);
    return 1;
}

SaySoQuickJSContext *sayso_qjs_create(void) {
    SaySoQuickJSContext *host = (SaySoQuickJSContext *)calloc(1, sizeof(SaySoQuickJSContext));
    if (host == 0) {
        return 0;
    }
    host->runtime = JS_NewRuntime();
    if (host->runtime == 0) {
        free(host);
        return 0;
    }
    JS_SetMemoryLimit(host->runtime, 16 * 1024 * 1024);
    host->context = JS_NewContext(host->runtime);
    if (host->context == 0) {
        JS_FreeRuntime(host->runtime);
        free(host);
        return 0;
    }
    JS_SetContextOpaque(host->context, host);
    host->registered_application = JS_UNDEFINED;
    sayso_qjs_install_sayso_global(host);
    return host;
}

void sayso_qjs_destroy(SaySoQuickJSContext *context) {
    if (context == 0) {
        return;
    }
    free(context->program);
    free(context->params_json);
    free(context->registered_application_json);
    if (context->context != 0) {
        JS_FreeValue(context->context, context->registered_application);
        JS_FreeContext(context->context);
    }
    if (context->runtime != 0) {
        JS_FreeRuntime(context->runtime);
    }
    free(context);
}

int sayso_qjs_set_params_json(SaySoQuickJSContext *context, const char *params_json, char *error_buffer, int error_buffer_length) {
    if (context == 0 || context->context == 0) {
        sayso_qjs_write_error(error_buffer, error_buffer_length, "QuickJS context is missing.");
        return 0;
    }
    JSValue parsed = sayso_qjs_json_parse(context->context, params_json);
    if (JS_IsException(parsed)) {
        sayso_qjs_write_exception(context->context, error_buffer, error_buffer_length);
        JS_FreeValue(context->context, parsed);
        return 0;
    }
    JS_FreeValue(context->context, parsed);
    char *copy = sayso_qjs_strdup(params_json != 0 ? params_json : "{}");
    if (copy == 0) {
        sayso_qjs_write_error(error_buffer, error_buffer_length, "Unable to copy runtime params.");
        return 0;
    }
    free(context->params_json);
    context->params_json = copy;
    return 1;
}

int sayso_qjs_load(SaySoQuickJSContext *context, const char *program, char *error_buffer, int error_buffer_length) {
    if (context == 0 || context->context == 0) {
        sayso_qjs_write_error(error_buffer, error_buffer_length, "QuickJS context is missing.");
        return 0;
    }
    if (program == 0 || strlen(program) == 0) {
        sayso_qjs_write_error(error_buffer, error_buffer_length, "Runtime source is empty.");
        return 0;
    }

    JSValue result = JS_Eval(context->context, program, strlen(program), "sayso-entrypoint.js", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(result)) {
        sayso_qjs_write_exception(context->context, error_buffer, error_buffer_length);
        JS_FreeValue(context->context, result);
        return 0;
    }
    JS_FreeValue(context->context, result);
    if (!sayso_qjs_execute_pending_jobs(context, error_buffer, error_buffer_length)) {
        return 0;
    }
    if (context->registered_application_json == 0) {
        sayso_qjs_write_error(error_buffer, error_buffer_length, "Runtime source did not register an application.");
        return 0;
    }

    char *copy = sayso_qjs_strdup(program);
    if (copy == 0) {
        sayso_qjs_write_error(error_buffer, error_buffer_length, "Unable to copy runtime source.");
        return 0;
    }
    free(context->program);
    context->program = copy;
    return 1;
}

const char *sayso_qjs_program(SaySoQuickJSContext *context) {
    if (context == 0) {
        return 0;
    }
    return context->program;
}

const char *sayso_qjs_registered_application_json(SaySoQuickJSContext *context) {
    if (context == 0) {
        return 0;
    }
    return context->registered_application_json;
}

char *sayso_qjs_call_application(SaySoQuickJSContext *context, const char *method, const char *input_json, char *error_buffer, int error_buffer_length) {
    if (context == 0 || context->context == 0 || JS_IsUndefined(context->registered_application)) {
        sayso_qjs_write_error(error_buffer, error_buffer_length, "QuickJS application is not running.");
        return 0;
    }
    if (method == 0 || strlen(method) == 0) {
        sayso_qjs_write_error(error_buffer, error_buffer_length, "QuickJS method is missing.");
        return 0;
    }

    JSContext *ctx = context->context;
    JSValue function = JS_GetPropertyStr(ctx, context->registered_application, method);
    if (!JS_IsFunction(ctx, function)) {
        JS_FreeValue(ctx, function);
        sayso_qjs_write_error(error_buffer, error_buffer_length, "QuickJS application method is missing.");
        return 0;
    }

    JSValue input = sayso_qjs_json_parse(ctx, input_json);
    if (JS_IsException(input)) {
        JS_FreeValue(ctx, function);
        sayso_qjs_write_exception(ctx, error_buffer, error_buffer_length);
        JS_FreeValue(ctx, input);
        return 0;
    }

    JSValue result = JS_Call(ctx, function, context->registered_application, 1, (JSValueConst *)&input);
    JS_FreeValue(ctx, input);
    JS_FreeValue(ctx, function);
    if (JS_IsException(result)) {
        sayso_qjs_write_exception(ctx, error_buffer, error_buffer_length);
        JS_FreeValue(ctx, result);
        return 0;
    }
    if (!sayso_qjs_execute_pending_jobs(context, error_buffer, error_buffer_length)) {
        JS_FreeValue(ctx, result);
        return 0;
    }
    if (JS_PromiseState(ctx, result) == JS_PROMISE_FULFILLED) {
        JSValue promise_result = JS_PromiseResult(ctx, result);
        JS_FreeValue(ctx, result);
        result = promise_result;
    } else if (JS_PromiseState(ctx, result) == JS_PROMISE_REJECTED) {
        JSValue promise_result = JS_PromiseResult(ctx, result);
        const char *message = JS_ToCString(ctx, promise_result);
        sayso_qjs_write_error(error_buffer, error_buffer_length, message != 0 ? message : "QuickJS promise rejected.");
        if (message != 0) {
            JS_FreeCString(ctx, message);
        }
        JS_FreeValue(ctx, promise_result);
        JS_FreeValue(ctx, result);
        return 0;
    }

    JSValue json_value = sayso_qjs_json_stringify(ctx, result);
    JS_FreeValue(ctx, result);
    if (JS_IsException(json_value)) {
        sayso_qjs_write_exception(ctx, error_buffer, error_buffer_length);
        JS_FreeValue(ctx, json_value);
        return 0;
    }
    const char *json = JS_ToCString(ctx, json_value);
    if (json == 0) {
        JS_FreeValue(ctx, json_value);
        sayso_qjs_write_error(error_buffer, error_buffer_length, "Unable to serialize QuickJS result.");
        return 0;
    }
    char *copy = sayso_qjs_strdup(json);
    JS_FreeCString(ctx, json);
    JS_FreeValue(ctx, json_value);
    if (copy == 0) {
        sayso_qjs_write_error(error_buffer, error_buffer_length, "Unable to copy QuickJS result.");
        return 0;
    }
    return copy;
}

void sayso_qjs_free_string(char *value) {
    free(value);
}
