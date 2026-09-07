export function syntheticPresentationPacket(templateSha256) {
  return {kind:'presentation_packet',project_ref:'project.synthetic',source_ref:'packet.synthetic_pptx:v1',provenance:'synthetic_fixture',revision:'revision.synthetic:v1',approval_ref:'approval.synthetic',template_sha256:templateSha256,slides:[{title:'Synthetic input',body:'Two approved synthetic records'},{title:'Candidate result',body:'Human acceptance remains separate'}]};
}
