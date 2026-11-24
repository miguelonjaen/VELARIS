import { parseInventory, type TechnicalInventory } from '../model';
import { persistDraft, type DraftStorage, type InventorySnapshot } from '../drafts';
import { canonicalJson, InventoryConflictError, saveWithRecovery } from '../persistence';

export interface EditorState { snapshot:InventorySnapshot; dirty:boolean; saving:boolean; conflict:boolean; message:string; canUndo:boolean; canRedo:boolean }
/** Serializes remote writes while allowing local editing. Every accepted edit is copied locally first. */
export class ElectricalSession {
  private snapshot:InventorySnapshot; private dirty:boolean; private saving=false; private conflict:boolean;
  private message='Sin cambios pendientes'; private past:TechnicalInventory[]=[];private future:TechnicalInventory[]=[];
  private listeners=new Set<()=>void>();private timer:ReturnType<typeof setTimeout>|null=null;private disposed=false;private generation=0;private running:Promise<void>|null=null;
  private cached:EditorState;
  private recoveryLocked:boolean;
  private paused=false;
  private aborter=new AbortController();
  constructor(initial:InventorySnapshot,private storage:DraftStorage,private key:string,private commit:(snapshot:InventorySnapshot, signal?:AbortSignal)=>Promise<InventorySnapshot>,dirty=false,conflict=false,private delay=700){
    this.snapshot=initial;this.dirty=dirty;this.conflict=conflict;this.recoveryLocked=conflict&&!dirty;this.cached=this.state();if(dirty){this.paused=true;this.message='Borrador recuperado; revisa y guarda explícitamente';}this.emit();
  }
  private state():EditorState{return {snapshot:this.snapshot,dirty:this.dirty,saving:this.saving,conflict:this.conflict,message:this.message,canUndo:!!this.past.length,canRedo:!!this.future.length};}
  getState=()=>this.cached;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  private emit(){this.cached=this.state();this.listeners.forEach(listener=>listener());}
  private local(){try{persistDraft(this.storage,this.key,this.snapshot);this.message='Guardado local · pendiente de sincronizar';}catch(cause:unknown){this.message=cause instanceof Error?cause.message:'No se pudo guardar la copia local';}}
  change(inventory:TechnicalInventory,history=true){if(this.recoveryLocked)throw new Error('El borrador local es ilegible y se conserva intacto. Expórtalo o descártalo explícitamente antes de editar.');parseInventory(inventory);if(this.disposed)return;
    if(canonicalJson(inventory)===canonicalJson(this.snapshot.inventory))return;
    if(history){this.past=[...this.past.slice(-49),this.snapshot.inventory];this.future=[];}
    this.snapshot={...this.snapshot,inventory};this.generation++;this.dirty=true;this.local();this.emit();this.schedule();
  }
  undo(){const previous=this.past.pop();if(!previous)return;this.future.push(this.snapshot.inventory);this.change(previous,false);}
  redo(){const next=this.future.pop();if(!next)return;this.past.push(this.snapshot.inventory);this.change(next,false);}
  resume(){this.disposed=false;if(this.aborter.signal.aborted)this.aborter=new AbortController();}
  reconnect(){if(!this.paused)void this.flush();}
  notice(message:string){this.message=message;this.emit();}
  recoveryText(){return this.storage.getItem(this.key);}
  externalChange(inventory:TechnicalInventory){this.past=[];this.future=[];this.change(inventory,false);this.emit();}
  async discardAndReload(load:(signal?:AbortSignal)=>Promise<InventorySnapshot>){
    if(this.running)throw new Error('Espera a que termine el guardado en curso');
    const generation=this.generation,signal=this.aborter.signal;const remote=await load(signal);
    signal.throwIfAborted();
    if(generation!==this.generation)throw new Error('Hay cambios nuevos durante la recarga; el borrador se conserva');
    if(this.timer){clearTimeout(this.timer);this.timer=null;}
    this.storage.removeItem(this.key);this.snapshot=remote;this.paused=false;this.dirty=false;this.conflict=false;this.recoveryLocked=false;this.past=[];this.future=[];this.generation++;this.message='Revisión del servidor cargada';this.emit();
  }
  private schedule(){if(this.timer)clearTimeout(this.timer);if(this.conflict||this.disposed||this.paused)return;this.timer=setTimeout(()=>{this.timer=null;void this.flush(false);},this.delay);}
  async flush(explicit=true):Promise<void>{
    if(explicit)this.paused=false;
    if(this.paused)return;
    if(this.running){await this.running;if(this.dirty&&!this.conflict&&!this.disposed&&!this.paused)return this.flush(false);return;}
    if(!this.dirty||this.conflict||this.disposed)return;
    if(this.timer){clearTimeout(this.timer);this.timer=null;}
    const sent=this.snapshot,generation=this.generation;this.saving=true;this.message='Sincronizando…';this.emit();
    this.running=(async()=>{
      try{
        const signal=this.aborter.signal;
        const receipt=await saveWithRecovery(this.storage,this.key,sent,async value=>{const confirmed=await this.commit(value,signal);signal.throwIfAborted();return confirmed;});
        this.snapshot={revision:receipt.snapshot.revision,inventory:this.generation===generation?receipt.snapshot.inventory:this.snapshot.inventory};
        this.dirty=this.generation!==generation;
        if(this.dirty)this.local();else this.message=receipt.recoveryWarning??'Guardado y confirmado en Supabase';
      }catch(cause:unknown){this.paused=true;this.conflict=cause instanceof InventoryConflictError;this.message=cause instanceof Error?cause.message:'Sin sincronización; cambios locales pendientes';this.dirty=true;}
      finally{this.saving=false;this.running=null;this.emit();if(this.dirty&&!this.conflict&&this.generation!==generation&&!this.disposed)this.schedule();}
    })();await this.running;
  }
  dispose(){this.disposed=true;this.aborter.abort();if(this.timer){clearTimeout(this.timer);this.timer=null;}if(this.dirty)this.local();}
}
