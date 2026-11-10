import {filePreviews} from '@/server/file-import-preview';
import {fileText} from '@/server/authorized-file-text';
import {navigation,navigationDraft} from '@/server/navigation';
import {resolveMaterial} from '@/server/discovery-materials';
import {localeSchema as discoveryLocale} from '@/server/discovery-utils';
import {z} from 'zod';
import {home,topics} from '@/server/discovery-home';
import {interests,subscriptions,topicNotices} from '@/server/discovery-personal';
import {measurements} from '@/server/discovery-measurements';
import {explanation} from '@/server/discovery-explanation';
import {places,related} from '@/server/discovery-places';
import {aliasList} from '@/server/discovery-names';
import {adminFacts} from '@/server/discovery-facts';
import {sourceDrafts} from '@/server/source-drafts';
import { db } from '@/server/db';
import { ApiError, handle, json, readJson, requireUser, sameOrigin, rateLimit, queryParams } from '@/server/http';
import { staffContext as staffMeGate, staffMe, staffRoles, staffUsers, assignments, auditList } from '@/server/staff';
import { adminContent, newRevision, editRevision, transitionRevision, publicContent, editorialNotices, revisionEvents } from '@/server/cms';
import { adminBranches, archiveRecords, restoreDocument } from '@/server/archive-admin';
import { newDocumentRevision } from '@/server/archive-revisions';
import { getAuth } from '@/server/auth';
import { documentList, fileResponse, publicDocument } from '@/server/catalog';
import { createComment, decideComment, decisionHistory, listComments, moderationQueue, ownComments, reportComment } from '@/server/discussions';
import { assistant } from '@/server/assistant';
import { assistantQuality } from '@/server/corpus-health';
import {publicBranchScope, publicDocumentWhere} from '@/server/public-visibility';
import {uploads, uploadContent, uploadRetry, reviewUpload, publishUpload,uploadInspection} from '@/server/uploads';
import {catalogImports, importAction, exportImport} from '@/server/catalog-imports';
import { getGuide, guides } from '@/server/guides';
import { deleteFavorites, listFavorites, saveFavorites } from '@/server/personal';
import { listNotifications, notificationSettings, readNotification } from '@/server/notifications';
import { similarDocuments } from '@/server/similarity';
import { recognizedText } from '@/server/ocr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function dispatch(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return handle(async () => {
    const { path = [] } = await context.params;
    const method = request.method;
    const route = path.join('/');
    // Restrict auth surface to login/logout/session. No public sign-up or user mutation.
    if (path[0] === 'auth') {
      if (!['auth/sign-in/email', 'auth/sign-out', 'auth/get-session'].includes(route)) throw new ApiError(404, 'NOT_FOUND', 'Маршрут не найден.');
      if (method !== (route === 'auth/get-session' ? 'GET' : 'POST')) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается.');
      if (method === 'POST') {
        sameOrigin(request);
        const body = await readJson(request, 4096);
        if(route==='auth/sign-in/email'){
          await rateLimit('auth-login-gate',30,60);
          const email=(body as {email?:unknown})?.email;
          if(typeof email==='string'){
            const candidate=await db.user.findUnique({where:{email:email.toLowerCase()}});
            if(candidate&&!candidate.isActive)throw new ApiError(401,'INVALID_CREDENTIALS','Неверные учётные данные.');
          }
        }
        request = new Request(request.url, { method, headers: request.headers, body: JSON.stringify(body) });
      }
      if(route==='auth/get-session'){
        const session=await getAuth().api.getSession({headers:request.headers,query:{disableCookieCache:true}});
        if(session){try{await requireUser(request);}catch(e){if(e instanceof ApiError&&e.status===401)return json(null);throw e;}}
      }
      const response = await getAuth().handler(request);
      if(route==='auth/sign-in/email'&&response.ok){
        const session=await response.clone().json().catch(()=>null);
        const userId=session?.user?.id;
        if(typeof userId==='string'&&await db.staffAssignment.count({where:{userId}}))await db.auditEvent.create({data:{actorId:userId,action:'STAFF_SIGNIN',entityId:userId}});
      }
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }
    if (method !== 'GET') sameOrigin(request);
    if(path[0]==='admin')await staffMeGate(request);
    if(route==='admin/discovery/facts'&&['GET','POST'].includes(method))return adminFacts(request);
    if(path[0]==='admin'&&path[1]==='discovery'&&path[2]==='facts'){
      if(path.length===4&&['GET','PATCH'].includes(method))return adminFacts(request,path[3]);
      if(path.length===5&&['verify','withdraw','revise'].includes(path[4])&&method==='POST')return adminFacts(request,path[3],path[4]);
    }
    if(path[0]==='documents'&&path.length===3&&path[2]==='explanation'&&method==='POST')return explanation(request,path[1]);
    if(path[0]==='discovery'&&path[1]==='materials'&&path.length===4&&['document','cms'].includes(path[2])&&method==='GET'){
      const p=z.object({locale:discoveryLocale.default('ru')}).strict().parse(queryParams(request));
      const material=await resolveMaterial({kind:path[2] as 'document'|'cms',id:path[3]},p.locale);
      if(!material)throw new ApiError(404,'NOT_FOUND','Материал не найден.');return json({item:material.material,source:material.source});
    }
    if(route==='navigation'&&method==='GET')return navigation(request);
    if(route==='admin/navigation'&&method==='POST')return navigationDraft(request);
    if(route==='discovery/home'&&method==='GET')return home(request);
    if(route==='discovery/topics'&&method==='GET')return topics(request);
    if(route==='discovery/events'&&method==='POST')throw new ApiError(503,'COLLECTION_NOT_CONFIGURED','Сервис временно недоступен.');
    if(route==='admin/discovery/measurements'&&['GET','POST','DELETE'].includes(method))return measurements(request);
    if(route==='me/interests'&&['GET','PUT'].includes(method))return interests(request);
    if(route==='me/topic-subscriptions'&&['GET','POST'].includes(method))return subscriptions(request);
    if(path[0]==='me'&&path[1]==='topic-subscriptions'&&path.length===3&&method==='DELETE')return subscriptions(request,path[2]);
    if(route==='me/topic-notifications'&&method==='GET')return topicNotices(request);
    if(path[0]==='me'&&path[1]==='topic-notifications'&&path.length===3&&method==='PATCH')return topicNotices(request,path[2]);
    if(route==='places'&&method==='GET')return places(request);
    if(path[0]==='places'&&path.length===3&&path[2]==='history'&&method==='GET')return places(request,path[1]);
    if(path[0]==='documents'&&path.length===3&&path[2]==='related'&&method==='GET')return related(request,path[1]);
    if(route==='discovery/aliases'&&method==='GET')return aliasList(request);
    if(route==='admin/source-drafts'&&['GET','POST'].includes(method))return sourceDrafts(request);
    if(path[0]==='admin'&&path[1]==='source-drafts'&&path.length===3&&method==='GET')return sourceDrafts(request,path[2]);
    if(path[0]==='admin'&&path[1]==='source-drafts'&&path.length===4&&path[3]==='commit'&&method==='POST')return sourceDrafts(request,path[2],path[3]);
    if(route==='admin/me'&&method==='GET')return staffMe(request);
    if(route==='admin/assistant/quality'&&method==='GET')return assistantQuality(request);
    if(route==='admin/uploads'&&['GET','POST'].includes(method))return uploads(request);
    if(route==='admin/file-previews'&&method==='POST')return filePreviews(request);
    if(path[0]==='admin'&&path[1]==='file-previews'){
      if(path.length===3&&['GET','DELETE'].includes(method))return filePreviews(request,path[2]);
      if(path.length===4&&path[3]==='stage'&&method==='POST')return filePreviews(request,path[2],'stage');
    }
    if(route==='admin/imports'&&['GET','POST'].includes(method))return catalogImports(request);
    if(path[0]==='admin'&&path[1]==='imports'){
      if(path.length===3&&method==='GET')return catalogImports(request,path[2]);
      if(path.length===4&&path[3]==='export'&&method==='GET')return exportImport(request,path[2]);
      if(path.length===4&&['validate','commit','rollback','cancel'].includes(path[3])&&method==='POST')return importAction(request,path[2],path[3]);
    }
    if(path[0]==='admin'&&path[1]==='uploads'&&path.length===3&&method==='GET')return uploads(request,path[2]);
    if(path[0]==='admin'&&path[1]==='uploads'&&path.length===4){
      if(path[3]==='inspection'&&method==='GET')return uploadInspection(request,path[2]);
      if(path[3]==='inspection-retry'&&method==='POST')return uploadInspection(request,path[2],true);
      if(path[3]==='content'&&['GET','PUT'].includes(method))return uploadContent(request,path[2]);
      if(path[3]==='retry'&&method==='POST')return uploadRetry(request,path[2]);
      if(path[3]==='review'&&method==='POST')return reviewUpload(request,path[2]);
      if(path[3]==='publish'&&method==='POST')return publishUpload(request,path[2]);
    }
    if(route==='admin/roles'&&['GET','PUT'].includes(method))return staffRoles(request);
    if(route==='admin/users'&&['GET','POST'].includes(method))return staffUsers(request);
    if(path[0]==='admin'&&path[1]==='users'&&path.length===3&&method==='PATCH')return staffUsers(request,path[2]);
    if(route==='admin/assignments'&&['POST','DELETE'].includes(method))return assignments(request);
    if(route==='admin/audit'&&method==='GET')return auditList(request);
    if(route==='admin/notices'&&method==='GET')return editorialNotices(request);
    if(route==='admin/branches'&&['GET','POST'].includes(method))return adminBranches(request);
    if(path[0]==='admin'&&path[1]==='branches'&&path.length===3&&method==='PATCH')return adminBranches(request,path[2]);
    if(path[0]==='admin'&&path[1]==='catalog'&&path.length===3&&['funds','inventories','cases','documents'].includes(path[2])&&['GET','POST'].includes(method))return archiveRecords(request,path[2]);
    if(path[0]==='admin'&&path[1]==='catalog'&&['funds','inventories','cases','documents'].includes(path[2])){
      if(path.length===4&&['GET','PATCH','DELETE'].includes(method))return archiveRecords(request,path[2],path[3]);
      if(path[2]==='documents'&&path.length===5&&method==='POST'){
        if(path[4]==='revisions')return newDocumentRevision(request,path[3]);
        if(path[4]==='restore')return restoreDocument(request,path[3]);
      }
    }
    if(route==='admin/content'&&['GET','POST'].includes(method))return adminContent(request);
    if(path[0]==='admin'&&path[1]==='content'){
      if(path.length===3&&method==='GET')return adminContent(request,path[2]);
      if(path.length===4&&path[3]==='revisions'&&method==='POST')return newRevision(request,path[2]);
    }
    if(path[0]==='admin'&&path[1]==='revisions'){
      if(path.length===3&&method==='PATCH')return editRevision(request,path[2]);
      if(path.length===4&&path[3]==='transition'&&method==='POST')return transitionRevision(request,path[2]);
      if(path.length===4&&path[3]==='events'&&method==='GET')return revisionEvents(request,path[2]);
    }
    if(route==='branches'&&method==='GET'){const url=new URL(request.url);if(url.searchParams.has('kind'))throw new ApiError(400,'VALIDATION_ERROR','Параметр kind не поддерживается.');url.searchParams.set('kind','BRANCH_PROFILE');return publicContent(new Request(url,{headers:request.headers}));}
    if(route==='content'&&method==='GET')return publicContent(request);
    if(path[0]==='content'&&path.length===2&&method==='GET')return publicContent(request,path[1]);
    if (route === 'guides' && method === 'GET') return json({ items: guides });
    if (path[0] === 'guides' && path.length === 2 && method === 'GET') {
      const item = getGuide(path[1]);
      if (!item) throw new ApiError(404, 'NOT_FOUND', 'Справка не найдена.');
      return json({ item });
    }
    if (route === 'health' && method === 'GET') {
      try { await db.$queryRaw`SELECT 1`; return json({ status: 'ok', database: 'ok' }); }
      catch { return json({ status: 'unavailable', database: 'unavailable' }, 503); }
    }
    if (route === 'funds' && method === 'GET') return json({ items: await db.fund.findMany({ where: { ...publicBranchScope, documents: { some: publicDocumentWhere } }, orderBy: { id: 'asc' } }) });
    if (route === 'documents' && method === 'GET') return documentList(request);
    if (path[0] === 'documents' && path.length === 2 && method === 'GET') return json({ item: await publicDocument(path[1],request) });
    if (path[0] === 'documents' && path.length === 3 && path[2] === 'similar' && method === 'GET') return similarDocuments(path[1]);
    if (path[0] === 'documents' && path.length === 3 && path[2] === 'comments') {
      if (method === 'GET') return listComments(request, path[1]);
      if (method === 'POST') return createComment(request, path[1]);
    }
    if (path[0] === 'files' && path.length === 2 && method === 'GET') return fileResponse(request, path[1]);
    if(path[0]==='files'&&path.length===3&&path[2]==='text'&&method==='GET')return fileText(request,path[1]);
    if (path[0] === 'files' && path.length === 3 && path[2] === 'ocr' && method === 'GET') return recognizedText(request, path[1]);
    if (route === 'me' && method === 'GET') {
      const user = await requireUser(request);
      return json({ item: { id: user.id, name: user.name, email: user.email, role: user.role } });
    }
    if (route === 'me/comments' && method === 'GET') return ownComments(request);
    if (route === 'me/favorites') {
      if (method === 'GET') return listFavorites(request);
      if (method === 'DELETE') return deleteFavorites(request);
    }
    if (route === 'me/favorites/import' && method === 'POST') return saveFavorites(request);
    if (path[0] === 'me' && path[1] === 'favorites' && path.length === 3) {
      if (method === 'PUT') return saveFavorites(request, path[2]);
      if (method === 'DELETE') return deleteFavorites(request, path[2]);
    }
    if (route === 'me/notifications') {
      if (method === 'GET') return listNotifications(request);
      if (method === 'PATCH') return readNotification(request);
    }
    if (route === 'me/notification-settings' && ['GET', 'PATCH'].includes(method)) return notificationSettings(request);
    if (path[0] === 'me' && path[1] === 'notifications' && path.length === 3 && method === 'PATCH') return readNotification(request, path[2]);
    if (path[0] === 'comments' && path.length === 3 && path[2] === 'reports' && method === 'POST') return reportComment(request, path[1]);
    if (route === 'moderation/comments' && method === 'GET') return moderationQueue(request);
    if (path[0] === 'moderation' && path[1] === 'comments') {
      if (path.length === 3 && method === 'PATCH') return decideComment(request, path[2]);
      if (path.length === 4 && path[3] === 'history' && method === 'GET') return decisionHistory(request, path[2]);
    }
    if (route === 'assistant' && method === 'POST') return assistant(request);
    throw new ApiError(404, 'NOT_FOUND', 'Маршрут не найден или метод не поддерживается.');
  });
}
export { dispatch as GET, dispatch as POST, dispatch as PATCH, dispatch as DELETE, dispatch as PUT };
