-- class_info 테이블 인덱스 추가
-- liveStatus 인덱스 (상태별 필터링 최적화)
CREATE INDEX idx_class_info_liveStatus ON class_info(liveStatus);

-- teacherOne, teacherTwo 인덱스 (선생님별 필터링 최적화)
CREATE INDEX idx_class_info_teacherOne ON class_info(teacherOne);
CREATE INDEX idx_class_info_teacherTwo ON class_info(teacherTwo);

-- 복합 인덱스 (liveStatus와 name으로 정렬 최적화)
CREATE INDEX idx_class_info_liveStatus_name ON class_info(liveStatus DESC, name ASC);

-- admin_user_info 테이블 인덱스 추가
-- code 인덱스 (선생님 조회 최적화)
CREATE INDEX idx_admin_user_info_code ON admin_user_info(code);