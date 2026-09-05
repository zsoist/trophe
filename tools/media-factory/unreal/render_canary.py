import os, unreal,json,time,traceback
from pathlib import Path
root=Path(os.environ['TROPHE_FACTORY_ROOT']);out=root/'unreal-canary-02';out.mkdir(exist_ok=False)
try:
 unreal.EditorLevelLibrary.load_level('/Game/Trophe/Canary')
 actors=unreal.EditorLevelLibrary.get_all_level_actors();camera=next(a for a in actors if isinstance(a,unreal.CameraActor));mesh=unreal.load_asset('/Game/Trophe/Trophe_Dumbbell')
 assert isinstance(mesh,unreal.StaticMesh)
 (out/'reopen.json').write_text(json.dumps({'mesh':mesh.get_path_name(),'level':'/Game/Trophe/Canary','engine':unreal.SystemLibrary.get_engine_version(),'actors':[a.get_actor_label() for a in actors]},indent=2))
 started=time.monotonic();state={'render':False}
 def tick(delta):
  try:
   elapsed=time.monotonic()-started
   if elapsed>10 and not state['render']:
    state['render']=True;unreal.AutomationLibrary.take_high_res_screenshot(1280,720,str(out/'dumbbell.png'),camera=camera)
   if elapsed>25:
    files=list(out.glob('*.png'));(out/'terminal.json').write_text(json.dumps({'exit':0 if files else 2,'render_files':[str(p) for p in files],'elapsed':elapsed}));unreal.unregister_slate_post_tick_callback(handle);unreal.SystemLibrary.quit_editor()
  except Exception:
   (out/'error.txt').write_text(traceback.format_exc());unreal.unregister_slate_post_tick_callback(handle);unreal.SystemLibrary.quit_editor()
 handle=unreal.register_slate_post_tick_callback(tick)
except Exception:
 (out/'error.txt').write_text(traceback.format_exc());unreal.SystemLibrary.quit_editor()
