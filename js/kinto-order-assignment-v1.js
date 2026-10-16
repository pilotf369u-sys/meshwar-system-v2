(()=>{'use strict';
async function save(sb,branchId,rows,patch,one=false){try{
 const session=window.KintoStaffDirectoryV1.session();
 const expected=rows.map(row=>({id:row.id,status:row.status??null,courier_id:row.courier_id??null,delivery_agent_id:row.delivery_agent_id??null,delivery_fee:row.delivery_fee??null}));
 const result=await sb.rpc('kinto_save_branch_orders_session_v1',{p_role:session.actorRole,p_session_token:session.token,p_branch_id:branchId,p_expected:expected,p_patch:patch});
 return {...result,data:one?result.data?.[0]||null:result.data};
}catch(error){return {data:null,error}}}
window.KintoOrderAssignmentV1={save};
})();
