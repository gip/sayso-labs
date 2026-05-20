#ifndef CQUICKJS_H
#define CQUICKJS_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct SaySoQuickJSContext SaySoQuickJSContext;

SaySoQuickJSContext *sayso_qjs_create(void);
void sayso_qjs_destroy(SaySoQuickJSContext *context);
int sayso_qjs_set_params_json(SaySoQuickJSContext *context, const char *params_json, char *error_buffer, int error_buffer_length);
int sayso_qjs_load(SaySoQuickJSContext *context, const char *program, char *error_buffer, int error_buffer_length);
int sayso_qjs_load_bytecode(SaySoQuickJSContext *context, const uint8_t *bytecode, size_t bytecode_length, char *error_buffer, int error_buffer_length);
uint8_t *sayso_qjs_compile_bytecode(const char *program, size_t *bytecode_length, char *error_buffer, int error_buffer_length);
const char *sayso_qjs_program(SaySoQuickJSContext *context);
const char *sayso_qjs_registered_application_json(SaySoQuickJSContext *context);
const char *sayso_qjs_quickjs_version(void);
const char *sayso_qjs_bytecode_format_version(void);
char *sayso_qjs_call_application(SaySoQuickJSContext *context, const char *method, const char *input_json, char *error_buffer, int error_buffer_length);
void sayso_qjs_free_string(char *value);
void sayso_qjs_free_bytes(uint8_t *value);

#ifdef __cplusplus
}
#endif

#endif
