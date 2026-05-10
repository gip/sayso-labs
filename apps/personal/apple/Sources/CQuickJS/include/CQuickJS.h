#ifndef CQUICKJS_H
#define CQUICKJS_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct SaySoQuickJSContext SaySoQuickJSContext;

SaySoQuickJSContext *sayso_qjs_create(void);
void sayso_qjs_destroy(SaySoQuickJSContext *context);
int sayso_qjs_set_params_json(SaySoQuickJSContext *context, const char *params_json, char *error_buffer, int error_buffer_length);
int sayso_qjs_load(SaySoQuickJSContext *context, const char *program, char *error_buffer, int error_buffer_length);
const char *sayso_qjs_program(SaySoQuickJSContext *context);
const char *sayso_qjs_registered_application_json(SaySoQuickJSContext *context);
char *sayso_qjs_call_application(SaySoQuickJSContext *context, const char *method, const char *input_json, char *error_buffer, int error_buffer_length);
void sayso_qjs_free_string(char *value);

#ifdef __cplusplus
}
#endif

#endif
