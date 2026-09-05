# Unreal canary

Set `TROPHE_FACTORY_ROOT` to the private factory directory. Use only an isolated project with PythonScriptPlugin enabled. Admit one GPU job at a time under the program lease.

`import_canary.py` imports the actual Blender-exported `Trophe_Dumbbell.fbx`, saves the mesh/material and `/Game/Trophe/Canary` level. Its deferred screenshot does not complete when invoked with `-ExecutePythonScript`, because that launcher exits on script return. Preserve that result as import-only.

After the first process exits, invoke `render_canary.py` through `-ExecCmds="py <script>"` on the same private project. It reloads the saved level and mesh, renders a native 1280×720 image through Unreal's screenshot API, records a terminal result and quits. Verify the image plus task exit and process termination; file presence alone is insufficient. The initial canary uses basic dark lighting and is not a consumer asset or animated athlete validation.

The program's private evidence retains exact executed recipes, source FBX, logs, import/reopen records and the rendered image. No engine plugins or private binaries belong in this repository.
