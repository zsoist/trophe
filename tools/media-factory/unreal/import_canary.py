import os, unreal, json, time, traceback
from pathlib import Path
root=Path(os.environ['TROPHE_FACTORY_ROOT']);out=root/'unreal-canary-01';out.mkdir(exist_ok=True)
try:
 unreal.EditorLevelLibrary.new_level('/Game/Trophe/Canary')
 task=unreal.AssetImportTask();task.filename=str(root/'Trophe_Dumbbell.fbx');task.destination_path='/Game/Trophe';task.automated=True;task.save=True;task.replace_existing=False
 unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task]);paths=list(task.imported_object_paths);assert paths, 'Import returned no assets'
 mesh=next(unreal.load_asset(p) for p in paths if isinstance(unreal.load_asset(p),unreal.StaticMesh))
 actor=unreal.EditorLevelLibrary.spawn_actor_from_object(mesh,unreal.Vector(0,0,40));actor.set_actor_label('Trophe actual imported dumbbell')
 sun=unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.DirectionalLight,unreal.Vector(0,0,150),unreal.Rotator(-45,-30,0));sun.light_component.set_intensity(5)
 sky=unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.SkyLight,unreal.Vector(0,0,100));sky.light_component.set_intensity(1)
 camera=unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.CameraActor,unreal.Vector(65,-85,85));camera.set_actor_rotation(unreal.MathLibrary.find_look_at_rotation(camera.get_actor_location(),unreal.Vector(0,0,40)),False)
 unreal.EditorLevelLibrary.set_level_viewport_camera_info(camera.get_actor_location(),camera.get_actor_rotation())
 unreal.EditorLevelLibrary.save_current_level();unreal.EditorAssetLibrary.save_directory('/Game/Trophe')
 (out/'import.json').write_text(json.dumps({'imported_paths':paths,'mesh':mesh.get_path_name(),'engine':unreal.SystemLibrary.get_engine_version(),'screenshot_api':str(unreal.AutomationLibrary.take_high_res_screenshot.__doc__),'actor_bounds':str(actor.get_actor_bounds(False))},indent=2))
 started=time.monotonic();state={'render':False}
 def tick(delta):
  try:
   elapsed=time.monotonic()-started
   if elapsed>20 and not state['render']:
    state['render']=True;unreal.AutomationLibrary.take_high_res_screenshot(1280,720,str(out/'dumbbell.png'),camera=camera)
   if elapsed>35:
    files=list(out.glob('*.png'));(out/'terminal.json').write_text(json.dumps({'exit':0 if files else 2,'render_files':[str(p) for p in files],'elapsed':elapsed}));unreal.unregister_slate_post_tick_callback(handle);unreal.SystemLibrary.quit_editor()
  except Exception:
   (out/'error.txt').write_text(traceback.format_exc());unreal.unregister_slate_post_tick_callback(handle);unreal.SystemLibrary.quit_editor()
 handle=unreal.register_slate_post_tick_callback(tick)
except Exception:
 (out/'error.txt').write_text(traceback.format_exc());unreal.SystemLibrary.quit_editor()
