// Derived locations/chunks only. The caller validates the accepted record bytes.
// A locator supplied by the accepted snapshot is checked, never guessed.
const clean = value => String(value).replace(/\s/gu,'');
const fail = () => { throw new Error('approved document location unavailable'); };
export const DOCUMENT_REPRESENTATIONS = Object.freeze({
  'decision-v1':{chunking:'paragraph-v1',representation:'accepted-locations-v1'},
  'relation-v2':{chunking:'paragraph-table-v2',representation:'accepted-member-links-v2'},
});

export function buildDocumentRepresentation({extraction,records,locations,profile}) {
  if(!DOCUMENT_REPRESENTATIONS[profile] || !Array.isArray(records) || !Array.isArray(locations)
    || records.length!==locations.length)fail();
  const pages=extraction.extraction.pages, used=new Set(), approved=[];
  for(const record of records){
    if(used.has(record.id))fail(); used.add(record.id);
    const matching=locations.filter(loc=>loc.record_id===record.id);
    if(matching.length!==1)fail();
    const loc=matching[0], page=pages.find(p=>p.page_number===loc.page);
    const paragraph=page?.paragraphs.find(p=>p.paragraph_number===loc.paragraph);
    if(!paragraph || !clean(record.statement) || !clean(paragraph.text).includes(clean(record.statement)))fail();
    if(loc.table){
      const table=pages.find(p=>p.page_number===loc.table.page)?.tables.find(t=>t.table_number===loc.table.table);
      const cell=table?.cells.find(c=>c.row_number===loc.table.row && c.column_number===loc.table.column);
      if(!cell || !cell.bbox || cell.text!==record.value)fail();
    }
    approved.push(structuredClone(loc));
  }
  const chunks=[];
  for(const page of pages)for(const paragraph of page.paragraphs){
    const members=approved.filter(loc=>loc.page===page.page_number && loc.paragraph===paragraph.paragraph_number);
    // Record ids stay available to the common evidence proof guard. Untyped
    // paragraphs are included as retrieval material without becoming assertions.
    for(const id of members.length?members.map(loc=>loc.record_id):['paragraph:'+page.page_number+':'+paragraph.paragraph_number])
      chunks.push({chunk_id:id,page_numbers:[page.page_number],text:paragraph.text});
  }
  const result={locations:approved,chunks};
  if(profile==='relation-v2'){
    for(const page of pages)for(const table of page.tables)for(const cell of table.cells){
      if(typeof cell.text==='string' && cell.text.trim())chunks.push({
        chunk_id:'table:'+page.page_number+':'+table.table_number+':'+cell.row_number+':'+cell.column_number,
        page_numbers:[page.page_number],text:cell.text});
    }
    result.member_links=records.map(record=>{
      const loc=approved.find(l=>l.record_id===record.id);
      return {record_id:record.id,relations:structuredClone(record.relations),
        ...(loc.table?{table_chunk_id:'table:'+loc.table.page+':'+loc.table.table+':'+loc.table.row+':'+loc.table.column}:{})};
    });
  }
  if(new Set(chunks.map(c=>c.chunk_id)).size!==chunks.length)fail();
  return result;
}
