import os
import shutil
import sys
import hashlib

# Ensure stdout uses UTF-8 to avoid encoding problems on Windows console
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

# Target Downloads directory
TARGET_DIR = r"C:\Users\user\Downloads"

# Category mapping based on file extensions
CATEGORIES = {
    "문서": [".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".txt", ".hwp", ".hwpx", ".csv", ".rtf"],
    "이미지": [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".webp", ".ico", ".tiff"],
    "압축파일": [".zip", ".rar", ".7z", ".tar", ".gz", ".xz"],
    "설치프로그램": [".exe", ".msi"],
    "오디오_비디오": [".mp3", ".wav", ".m4a", ".flac", ".mp4", ".mkv", ".avi", ".mov", ".wmv"],
    "코드_데이터": [".py", ".js", ".html", ".css", ".json", ".md", ".cpp", ".java", ".c", ".xml", ".yaml", ".yml", ".bas"]
}

def get_sha256(file_path):
    """Calculate SHA256 of a file to check content identity."""
    h = hashlib.sha256()
    try:
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None

def organize(dry_run=True):
    if not os.path.exists(TARGET_DIR):
        print(f"오류: 대상 다운로드 폴더를 찾을 수 없습니다: {TARGET_DIR}")
        return

    # Scan for files only, ignore directories
    try:
        files = [f for f in os.listdir(TARGET_DIR) if os.path.isfile(os.path.join(TARGET_DIR, f))]
    except Exception as e:
        print(f"폴더를 읽는 도중 오류가 발생했습니다: {e}")
        return
    
    if not files:
        print("정리할 파일이 다운로드 폴더에 없습니다.")
        return

    print("기존 분류 폴더 내 파일들의 파일 해시(SHA256)를 분석하고 있습니다...")
    seen_hashes = {}  # hash -> file_path
    
    # Index files that are already sorted in subdirectories
    for category in list(CATEGORIES.keys()) + ["기타"]:
        folder_path = os.path.join(TARGET_DIR, category)
        if os.path.exists(folder_path):
            try:
                for filename in os.listdir(folder_path):
                    file_path = os.path.join(folder_path, filename)
                    if os.path.isfile(file_path):
                        f_hash = get_sha256(file_path)
                        if f_hash:
                            seen_hashes[f_hash] = file_path
            except Exception:
                continue

    print(f"\n=== 다운로드 폴더 정리 및 중복 제거 대상 목록 (총 {len(files)}개) ===")
    if dry_run:
        print("[시뮬레이션 모드] 실제 파일은 이동/삭제되지 않고 계획만 표시됩니다.\n")
    else:
        print("[실행 모드] 실제 파일 정리를 시작합니다.\n")

    moved_count = 0
    deleted_count = 0
    freed_size = 0

    for filename in files:
        # Ignore system hidden files like desktop.ini
        if filename.lower() == "desktop.ini":
            continue

        file_path = os.path.join(TARGET_DIR, filename)
        
        # Calculate hash for duplicate detection
        file_hash = get_sha256(file_path)
        file_size = os.path.getsize(file_path)

        # 1. Duplicate check (by SHA256 content hash)
        if file_hash in seen_hashes:
            orig_path = seen_hashes[file_hash]
            orig_rel_path = os.path.relpath(orig_path, TARGET_DIR)
            print(f"-> [중복 파일 감지] {filename} (크기: {file_size/1024:.1f} KB)")
            print(f"   (이미 동일 파일이 존재함: /{orig_rel_path})")
            
            if dry_run:
                print(f"   ==> [삭제 예정] 저장 공간 확보 대상 ({file_size/1024:.1f} KB)")
            else:
                try:
                    os.remove(file_path)
                    print(f"   ==> [삭제 완료] 중복 파일 삭제 완료 (저장 공간 확보)")
                except Exception as e:
                    print(f"   ==> [삭제 실패] {e}")
                    continue
            deleted_count += 1
            freed_size += file_size
            continue

        # 2. Not a duplicate - Determine target folder category
        _, ext = os.path.splitext(filename)
        ext = ext.lower()

        target_category = "기타"
        for category, extensions in CATEGORIES.items():
            if ext in extensions:
                target_category = category
                break

        target_folder = os.path.join(TARGET_DIR, target_category)
        print(f"-> {filename}  ==>  /{target_category}/{filename}")
        
        if not dry_run:
            try:
                if not os.path.exists(target_folder):
                    os.makedirs(target_folder)
                
                # Check for duplicate names (different content, same name)
                dest_path = os.path.join(target_folder, filename)
                if os.path.exists(dest_path):
                    name, extension = os.path.splitext(filename)
                    counter = 1
                    while os.path.exists(dest_path):
                        new_filename = f"{name}_{counter}{extension}"
                        dest_path = os.path.join(target_folder, new_filename)
                        counter += 1
                    print(f"   (동일 이름 파일 존재로 '{new_filename}'(으)로 이름 변경 이동)")
                
                shutil.move(file_path, dest_path)
                # Register hash to avoid duplicate processing in the same run
                seen_hashes[file_hash] = dest_path
            except Exception as e:
                print(f"   [오류] 이동 실패: {filename} - {e}")
                continue
        else:
            # Register hash in dry-run to capture duplicate files in the Downloads folder itself
            seen_hashes[file_hash] = os.path.join(target_folder, filename)
            
        moved_count += 1

    print("\n===========================================")
    if dry_run:
        print(f"시뮬레이션 완료. 실행하려면 명령에 '--execute' 인자를 추가하세요.")
        print(f"정렬 대기: {moved_count}개 | 중복 삭제 대기: {deleted_count}개 (예상 확보 공간: {freed_size/(1024*1024):.2f} MB)")
    else:
        print(f"실제 정리 완료!")
        print(f"이동 정렬: {moved_count}개 | 중복 삭제: {deleted_count}개 (실제 확보된 공간: {freed_size/(1024*1024):.2f} MB)")

if __name__ == "__main__":
    dry_run = True
    if len(sys.argv) > 1 and sys.argv[1] == "--execute":
        dry_run = False
    organize(dry_run)
