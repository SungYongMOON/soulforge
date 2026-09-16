import {createContext,useContext} from 'react';
import {projectLabel,namedProjectText} from './core/project-label.mjs';
export const ProjectNamesContext=createContext<Record<string,string>>({});
export const useProjectNames=()=>useContext(ProjectNamesContext);
export function ProjectLabel({code}:{code:string}){const names=useProjectNames();return <span className="oc-project-label" title="기존 과제 안내의 표시명 · 과제번호는 그대로 유지">{projectLabel(code,names)}</span>;}
export function ProjectText({text}:{text:string}){return <>{namedProjectText(text,useProjectNames())}</>;}
