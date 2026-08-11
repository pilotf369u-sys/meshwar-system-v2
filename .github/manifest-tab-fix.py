from pathlib import Path

EMP='employee-dashboard.html'
ADM='admin-dashboard.html'

emp=Path(EMP).read_text(encoding='utf-8')
admin=Path(ADM).read_text(encoding='utf-8')

emp_patch='''\n<script>\n/* BRANCH_MANIFEST_TAB_ROUTE_V1 */\nconst employeeSwitchPipelineBeforeManifest=switchPipeline;\nswitchPipeline=async function(key){\n  if(key==='branch_transfer'){\n    const employeeId=cloudId(currentEmployee?.id||getEmployeeId());\n    const url=`branch-manifest.html?employeeId=${encodeURIComponent(employeeId)}`;\n    location.href=url;\n    return;\n  }\n  return employeeSwitchPipelineBeforeManifest(key);\n};\nObject.assign(window,{switchPipeline});\n</script>\n'''
admin_patch='''\n<script>\n/* BRANCH_MANIFEST_TAB_ROUTE_V1 */\nconst adminSwitchPipelineBeforeManifest=switchAdminPipeline;\nswitchAdminPipeline=async function(key){\n  if(key==='branch_transfer'){\n    const adminId=String(currentAdminCloud?.id||getAdminId()||'').trim();\n    const url=`branch-manifest.html?adminId=${encodeURIComponent(adminId)}`;\n    location.href=url;\n    return;\n  }\n  return adminSwitchPipelineBeforeManifest(key);\n};\nObject.assign(window,{switchAdminPipeline});\n</script>\n'''

if 'BRANCH_MANIFEST_TAB_ROUTE_V1' not in emp:
    emp += emp_patch
if 'BRANCH_MANIFEST_TAB_ROUTE_V1' not in admin:
    admin += admin_patch
Path(EMP).write_text(emp,encoding='utf-8')
Path(ADM).write_text(admin,encoding='utf-8')
