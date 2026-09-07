import type {db} from '@/db/client';
import {createIsolatedEngineBoundary,isIsolatedEngineBoundary} from './isolated-engine-boundary';
import {photoFoodScopeSchema,type PhotoFoodObservationPort,type PhotoFoodScope} from './photo-food-observation';
export interface IsolatedPhotoFoodBoundary {readonly kind:'isolated_photo_food_fixture'}
const issued=new WeakMap<IsolatedPhotoFoodBoundary,{database:typeof db;port:PhotoFoodObservationPort;scopes:PhotoFoodScope[];valid:()=>boolean}>();
/** Server composition only: binds the exact disposable CI environment, pool,
 * observation port and fixture subjects. No request/body flag can mint authority.
 * Pool configuration is inspected without connecting or exposing credentials.
 */
export function createIsolatedPhotoFoodBoundary(env:Record<string,string|undefined>,database:typeof db,port:PhotoFoodObservationPort,fixtureScopes:PhotoFoodScope[]):IsolatedPhotoFoodBoundary{
 const engine=createIsolatedEngineBoundary(env),client=database.$client;
 const valid=()=>{
  if(!isIsolatedEngineBoundary(engine.boundary,engine.provider)||env.COACH_ASSISTANT_ISOLATED_PHOTO_FOOD_ENABLED!=='1'||database.$client!==client)return false;
  const options=client?.options;
  return !!options&&!('stream' in options&&options.stream)&&options.connectionString===env.DATABASE_URL&&(!options.host||options.host==='127.0.0.1')&&(!options.port||Number(options.port)===54322)&&(!options.database||options.database==='postgres');
 };
 if(!valid()||fixtureScopes.length<1||fixtureScopes.length>8)throw new Error('isolated_photo_food_disabled');
 const scopes=fixtureScopes.map(scope=>photoFoodScopeSchema.parse(scope));if(scopes.some(s=>s.actorId!==s.subjectId))throw new Error('isolated_photo_food_disabled');
 const boundary:IsolatedPhotoFoodBoundary=Object.freeze({kind:'isolated_photo_food_fixture'});issued.set(boundary,{database,port,scopes,valid});return boundary;
}
export function isIsolatedPhotoFoodBoundary(boundary:IsolatedPhotoFoodBoundary|undefined,database:typeof db,port:PhotoFoodObservationPort|undefined,scope:PhotoFoodScope){
 if(!boundary)return false;const found=issued.get(boundary);return !!found&&found.database===database&&found.port===port&&found.valid()&&found.scopes.some(s=>Object.keys(s).every(k=>s[k as keyof PhotoFoodScope]===scope[k as keyof PhotoFoodScope]));
}
