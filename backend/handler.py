import json, os, uuid
from datetime import datetime, timezone
import boto3
from boto3.dynamodb.conditions import Attr

TABLE=os.environ.get("TABLE_NAME"); BUCKET=os.environ.get("BUCKET_NAME")
table=boto3.resource("dynamodb").Table(TABLE) if TABLE else None
s3=boto3.client("s3")
def reply(code,body):
 return {"statusCode":code,"headers":{"content-type":"application/json","access-control-allow-origin":os.environ.get("CORS_ORIGIN","http://localhost:8000"),"access-control-allow-headers":"content-type,authorization","access-control-allow-methods":"GET,POST,PATCH,OPTIONS","cache-control":"no-store"},"body":json.dumps(body,default=str)}
def now(): return datetime.now(timezone.utc).isoformat()
def handler(event,context):
 method=event.get("requestContext",{}).get("http",{}).get("method","GET")
 path=event.get("rawPath","/")
 pp=event.get("pathParameters") or {}; qp=event.get("queryStringParameters") or {}
 if method=="OPTIONS": return reply(204,{})
 # Add Cognito/JWT authorization before making this API public.
 if not table or not BUCKET: return reply(500,{"error":"Backend configuration missing"})
 if method=="GET" and path=="/items":
  scan=table.scan(FilterExpression=Attr("status").is_in(["LOST","FOUND"])); rows=scan.get("Items",[])
  while scan.get("LastEvaluatedKey"):
   scan=table.scan(FilterExpression=Attr("status").is_in(["LOST","FOUND"]),ExclusiveStartKey=scan["LastEvaluatedKey"]);rows+=scan.get("Items",[])
  q=(qp.get("q") or "").lower(); kind=(qp.get("type") or "ALL").upper()
  rows=[x for x in rows if (kind=="ALL" or x.get("type")==kind) and q in " ".join(str(x.get(k,"")) for k in ("name","description","location","category")).lower()]
  rows.sort(key=lambda x:x.get("created_at",""),reverse=True)
  return reply(200,{"items":rows})
 if method=="GET" and path.startswith("/items/"):
  iid=pp.get("item_id") or path.rsplit("/",1)[-1]; item=table.get_item(Key={"item_id":iid}).get("Item")
  return reply(200,{"item":item}) if item else reply(404,{"error":"Item not found"})
 if method=="POST" and path=="/items":
  try: d=json.loads(event.get("body") or "{}")
  except ValueError:return reply(400,{"error":"Invalid JSON"})
  fields=("name","category","description","location","date","type")
  if any(not str(d.get(k,"")).strip() for k in fields):return reply(400,{"error":"Required fields missing"})
  kind=str(d["type"]).upper()
  if kind not in ("LOST","FOUND"):return reply(400,{"error":"type must be LOST or FOUND"})
  item={"item_id":str(uuid.uuid4()),"type":kind,"status":kind,"name":str(d["name"]).strip()[:80],"category":str(d["category"]).strip()[:60],"description":str(d["description"]).strip()[:500],"location":str(d["location"]).strip()[:120],"date":str(d["date"])[:10],"image_key":str(d.get("image_key",""))[:500],"created_at":now(),"updated_at":now()}
  table.put_item(Item=item,ConditionExpression="attribute_not_exists(item_id)")
  return reply(201,{"item":item})
 if method=="PATCH" and path.startswith("/items/"):
  iid=pp.get("item_id") or path.rsplit("/",1)[-1]
  try:d=json.loads(event.get("body") or "{}")
  except ValueError:return reply(400,{"error":"Invalid JSON"})
  status=str(d.get("status","")).upper()
  if status not in ("LOST","FOUND","RETURNED"):return reply(400,{"error":"Invalid status"})
  try:r=table.update_item(Key={"item_id":iid},UpdateExpression="SET #s=:s, updated_at=:u",ExpressionAttributeNames={"#s":"status"},ExpressionAttributeValues={":s":status,":u":now()},ConditionExpression="attribute_exists(item_id)",ReturnValues="ALL_NEW")
  except Exception as e:
   if e.__class__.__name__=="ConditionalCheckFailedException":return reply(404,{"error":"Item not found"})
   raise
  return reply(200,{"item":r["Attributes"]})
 if method=="POST" and path=="/uploads/presign":
  try:d=json.loads(event.get("body") or "{}")
  except ValueError:return reply(400,{"error":"Invalid JSON"})
  ct=d.get("content_type","")
  if ct not in ("image/jpeg","image/png","image/webp"):return reply(400,{"error":"Only JPEG, PNG and WebP are allowed"})
  key="item-images/"+str(uuid.uuid4())
  url=s3.generate_presigned_url("put_object",Params={"Bucket":BUCKET,"Key":key,"ContentType":ct},ExpiresIn=300)
  return reply(200,{"upload_url":url,"image_key":key,"expires_in_seconds":300})
 return reply(404,{"error":"Route not found"})
