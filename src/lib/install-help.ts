/** Instructions are a fallback only; the browser owns install availability. */
export function installHelp(userAgent:string,maxTouchPoints=0):{title:string;steps:string[]} {
 const ios=/iPhone|iPad|iPod/i.test(userAgent)||(/Macintosh/i.test(userAgent)&&maxTouchPoints>1);
 if(ios)return {title:'Cài ứng dụng trên iPhone / iPad',steps:['Mở nhà hàng bằng Safari.','Mở Chia sẻ → Thêm vào Màn hình chính.','Nếu có tùy chọn Mở dưới dạng ứng dụng web, bật tùy chọn này rồi nhấn Thêm.']};
 if(/Android/i.test(userAgent))return {title:'Cài ứng dụng trên Android',steps:['Mở nhà hàng bằng Chrome hoặc trình duyệt hỗ trợ.','Trong menu trình duyệt, tìm Cài ứng dụng hoặc Thêm vào màn hình chính nếu có.','Làm theo hướng dẫn của trình duyệt. Nếu chưa hỗ trợ, tiếp tục dùng website.']};
 return {title:'Cài ứng dụng trên máy tính',steps:['Mở nhà hàng bằng Chrome hoặc Edge.','Tìm biểu tượng cài ứng dụng trên thanh địa chỉ hoặc tùy chọn cài trang web thành ứng dụng trong menu, nếu có.','Nếu tùy chọn không xuất hiện, thiết bị có thể chưa hỗ trợ hoặc ứng dụng đã được cài. Bạn vẫn có thể dùng website.']};
}
