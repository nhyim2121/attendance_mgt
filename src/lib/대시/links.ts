/** 대시보드마다 따로 두는 바로가기 모음 (settings 표, 키 dash_links:<대시보드>). 처음엔 아래 기본 목록. 서버 전용. */
import "server-only";
import { getSetting, setSetting } from "../store";

export type Link = { group: string; name: string; url: string };
export const SCOPES = ["all", "hr", "ga", "ehs", "cert", "misc"] as const;
export type Scope = (typeof SCOPES)[number];

const L = (group: string, name: string, url: string): Link => ({ group, name, url });
const DEFAULT: Record<Scope, Link[]> = {
  all: [L("신고·발급", "정부24", "https://www.gov.kr"), L("신고·발급", "홈택스", "https://www.hometax.go.kr"), L("신고·발급", "4대보험 정보연계센터", "https://www.4insure.or.kr"),
    L("업무", "하이웍스", "https://office.hiworks.com"), L("업무", "우체국 등기 조회", "https://service.epost.go.kr")],
  hr: [L("노무", "고용노동부", "https://www.moel.go.kr"), L("노무", "고용24", "https://www.work24.go.kr"), L("노무", "4대보험 정보연계센터", "https://www.4insure.or.kr"),
    L("교육", "HRD-Net", "https://www.hrd.go.kr"), L("업무", "하이웍스", "https://office.hiworks.com")],
  ga: [L("발급", "인터넷등기소", "https://www.iros.go.kr"), L("발급", "홈택스", "https://www.hometax.go.kr"), L("발급", "정부24", "https://www.gov.kr"),
    L("입찰·지원", "나라장터", "https://www.g2b.go.kr"), L("입찰·지원", "기업마당", "https://www.bizinfo.go.kr"), L("우편", "우체국 등기 조회", "https://service.epost.go.kr")],
  ehs: [L("안전", "안전보건공단", "https://www.kosha.or.kr"), L("환경", "올바로시스템", "https://www.allbaro.or.kr"), L("보건", "국민건강보험공단", "https://www.nhis.or.kr")],
  cert: [L("확인·인증", "벤처확인시스템", "https://www.smes.go.kr/venturein"), L("확인·인증", "이노비즈", "https://www.innobiz.net"), L("연구소", "한국산업기술진흥협회", "https://www.koita.or.kr")],
  misc: [L("업무", "하이웍스", "https://office.hiworks.com")],
};

export const isScope = (s: string): s is Scope => (SCOPES as readonly string[]).includes(s);
export const loadLinks = (scope: Scope) => getSetting<Link[]>(`dash_links:${scope}`, DEFAULT[scope]);
export const saveLinks = (scope: Scope, list: Link[]) => setSetting(`dash_links:${scope}`, list);
